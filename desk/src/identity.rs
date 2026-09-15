// SPDX-License-Identifier: AGPL-3.0-only

//! People and groups, where people sign in. A group has a name, grants, a
//! detail and, under `oidc`, the provider groups it follows; a person holds
//! what all their groups give, with what an admin gave them alone on top.
//! The doors read with `identity:see` and change with `identity:work`, each
//! change from the desk's own origin, and no change leaves nobody holding
//! `identity:work`. The users doors of the ladder answer for one release,
//! each entitlement standing for its set.

use std::collections::{BTreeSet, HashMap};

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use crate::config::Mode;
use crate::grants::{self, Access, Detail};
use crate::proxy::same_origin;
use crate::session::{self, Person};
use crate::store::{Book, Change, Claims, Refused};
use crate::{Shared, users};

type Refusal = Box<Response>;

fn error(status: StatusCode, message: impl Into<String>) -> Response {
    (status, axum::Json(json!({"error": message.into()}))).into_response()
}

fn bad(message: impl Into<String>) -> Refusal {
    Box::new(error(StatusCode::BAD_REQUEST, message))
}

fn refused(r: Refused) -> Refusal {
    let status = match r {
        Refused::Invalid(_) => StatusCode::BAD_REQUEST,
        Refused::Unknown(_) => StatusCode::NOT_FOUND,
        Refused::Nobody => StatusCode::CONFLICT,
        Refused::Store(_) => StatusCode::INTERNAL_SERVER_ERROR,
    };
    Box::new(error(status, r.to_string()))
}

fn answer(r: Result<Response, Refusal>) -> Response {
    r.unwrap_or_else(|r| *r)
}

fn oidc(desk: &Shared) -> bool {
    desk.config.mode == Mode::Oidc
}

/// A desk nobody signs in to has one person and no groups.
fn signs_in(desk: &Shared) -> Result<(), Refusal> {
    if desk.config.mode == Mode::Off {
        return Err(Box::new(error(
            StatusCode::NOT_FOUND,
            "a desk nobody signs in to has one person and no groups",
        )));
    }
    Ok(())
}

/// Local users live at the desk in `local` mode only.
fn local_only(desk: &Shared) -> Result<(), Refusal> {
    if desk.config.mode != Mode::Local {
        let why = if desk.config.mode == Mode::Off {
            "a desk nobody signs in to keeps no users"
        } else {
            "people sign in through the provider in this mode, and the desk keeps no users"
        };
        return Err(Box::new(error(StatusCode::NOT_FOUND, why)));
    }
    Ok(())
}

/// The caller of a reading door, holding `identity:see`.
fn reader(desk: &Shared, headers: &HeaderMap) -> Result<Person, Refusal> {
    signs_in(desk)?;
    session::holding(desk, headers, "identity:see", "reading people and groups")
}

/// The caller of a change: from the desk's own origin, holding `identity:work`.
fn changer(desk: &Shared, headers: &HeaderMap) -> Result<Person, Refusal> {
    signs_in(desk)?;
    same_origin(&desk.config.origins(), headers)
        .map_err(|why| Box::new(error(StatusCode::FORBIDDEN, why)))?;
    session::holding(desk, headers, "identity:work", "changing people and groups")
}

fn body_of(text: &str) -> Result<Value, Refusal> {
    match serde_json::from_str::<Value>(text) {
        Ok(v) if v.is_object() => Ok(v),
        _ => Err(bad("the body is a JSON object")),
    }
}

/// An array of strings; nothing when the field is absent and not required.
fn strings(doc: &Value, field: &str, required: bool) -> Result<Vec<String>, Refusal> {
    match doc.get(field) {
        None | Some(Value::Null) if !required => Ok(Vec::new()),
        Some(Value::Array(a)) => a
            .iter()
            .map(|v| {
                v.as_str()
                    .map(str::to_string)
                    .ok_or_else(|| bad(format!("{field}: strings")))
            })
            .collect(),
        _ => Err(bad(format!("{field}: an array of strings"))),
    }
}

/// An array of group ids; nothing when the field is absent and not required.
fn ids(doc: &Value, field: &str, required: bool) -> Result<Vec<i64>, Refusal> {
    match doc.get(field) {
        None | Some(Value::Null) if !required => Ok(Vec::new()),
        Some(Value::Array(a)) => a
            .iter()
            .map(|v| v.as_i64().ok_or_else(|| bad(format!("{field}: group ids"))))
            .collect(),
        _ => Err(bad(format!("{field}: an array of group ids"))),
    }
}

/// A detail; none when absent or null.
fn detail(doc: &Value) -> Result<Option<Detail>, Refusal> {
    match doc.get("detail") {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(d)) => grants::check_detail(Some(d)).map_err(bad),
        _ => Err(bad(format!("detail: one of {}", Detail::NAMES.join(", ")))),
    }
}

/// The grants a body names, each in the vocabulary.
fn grants_of(doc: &Value, required: bool) -> Result<BTreeSet<String>, Refusal> {
    grants::check(&strings(doc, "grants", required)?).map_err(bad)
}

fn group_id(id: &str) -> Result<i64, Refusal> {
    id.parse::<i64>()
        .map_err(|_| Box::new(error(StatusCode::NOT_FOUND, format!("no group {id}"))))
}

fn group_json(desk: &Shared, id: i64) -> Result<Value, Refusal> {
    let book = desk.store.book();
    book.group(id)
        .map(|g| g.as_json(book.members_of(id)))
        .ok_or_else(|| Box::new(error(StatusCode::NOT_FOUND, format!("no group {id}"))))
}

/// A group as a body gives it: a name, grants, a detail (plain when none)
/// and the provider groups it follows.
fn group_body(doc: &Value) -> Result<(String, Access, Vec<String>), Refusal> {
    let name = doc["name"]
        .as_str()
        .ok_or_else(|| bad("name: a group has a name"))?;
    let grants = grants_of(doc, true)?;
    let detail = detail(doc)?.unwrap_or_default();
    let follows = strings(doc, "follows", false)?;
    Ok((name.to_string(), Access { grants, detail }, follows))
}

/// A person as the identity page lists them: their groups by id, the groups
/// their provider's groups reach, what they hold alone, what it all adds up
/// to, when they last signed in and the sessions they hold open.
fn row(
    book: &Book,
    subject: &str,
    display: &str,
    last_seen_at: Option<&String>,
    claims: Option<&Claims>,
    sessions: &HashMap<String, i64>,
) -> Value {
    let r = book.resolve(subject, claims);
    json!({
        "subject": subject,
        "display": display,
        "groups": r.member,
        "followed": r.followed,
        "grants": r.own,
        "detail": r.own_detail.map(Detail::as_str),
        "access": r.access.as_json(),
        "last_seen_at": last_seen_at,
        "sessions_open": sessions.get(subject).copied().unwrap_or(0),
    })
}

/// Everyone the identity page lists: the users in `local` mode, the people
/// who have signed in under `oidc`.
fn rows(desk: &Shared) -> Vec<Value> {
    let book = desk.store.book();
    let sessions = desk.store.sessions_by_subject();
    if oidc(desk) {
        desk.store
            .seen()
            .iter()
            .map(|p| {
                let seen = Some(&p.last_seen_at);
                row(
                    &book,
                    &p.subject,
                    &p.display,
                    seen,
                    Some(&p.claims),
                    &sessions,
                )
            })
            .collect()
    } else {
        let seen = desk.store.last_seen();
        desk.store
            .users()
            .iter()
            .map(|u| {
                let last = seen.get(&u.username);
                row(&book, &u.username, &u.display, last, None, &sessions)
            })
            .collect()
    }
}

fn person_row(desk: &Shared, subject: &str) -> Result<Value, Refusal> {
    rows(desk)
        .into_iter()
        .find(|r| r["subject"] == subject)
        .ok_or_else(|| Box::new(error(StatusCode::NOT_FOUND, format!("no person {subject}"))))
}

// --- groups

/// `GET /desk/groups` (identity:see): every group, with its members.
pub async fn groups_list(State(desk): State<Shared>, headers: HeaderMap) -> Response {
    answer((|| {
        reader(&desk, &headers)?;
        let book = desk.store.book();
        let groups: Vec<Value> = book
            .groups
            .iter()
            .map(|g| g.as_json(book.members_of(g.id)))
            .collect();
        Ok(axum::Json(json!({ "groups": groups })).into_response())
    })())
}

/// `POST /desk/groups {name, grants, detail, follows}` (identity:work).
pub async fn groups_add(State(desk): State<Shared>, headers: HeaderMap, body: String) -> Response {
    answer((|| {
        changer(&desk, &headers)?;
        let (name, access, follows) = group_body(&body_of(&body)?)?;
        let id = desk
            .store
            .change(
                oidc(&desk),
                Change::GroupAdd {
                    name,
                    access,
                    follows,
                },
            )
            .map_err(refused)?
            .ok_or_else(|| bad("the group was not made"))?;
        Ok((StatusCode::CREATED, axum::Json(group_json(&desk, id)?)).into_response())
    })())
}

/// `PUT /desk/groups/{id} {name, grants, detail, follows}` (identity:work).
pub async fn groups_set(
    State(desk): State<Shared>,
    headers: HeaderMap,
    Path(id): Path<String>,
    body: String,
) -> Response {
    answer((|| {
        changer(&desk, &headers)?;
        let id = group_id(&id)?;
        let (name, access, follows) = group_body(&body_of(&body)?)?;
        desk.store
            .change(
                oidc(&desk),
                Change::GroupSet {
                    id,
                    name,
                    access,
                    follows,
                },
            )
            .map_err(refused)?;
        Ok(axum::Json(group_json(&desk, id)?).into_response())
    })())
}

/// `DELETE /desk/groups/{id}` (identity:work): the group and its members' rows.
pub async fn groups_remove(
    State(desk): State<Shared>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    answer((|| {
        changer(&desk, &headers)?;
        let id = group_id(&id)?;
        desk.store
            .change(oidc(&desk), Change::GroupRemove { id })
            .map_err(refused)?;
        Ok(StatusCode::NO_CONTENT.into_response())
    })())
}

// --- people

/// `GET /desk/access` (identity:see): how people sign in, the sessions open,
/// and each person with their groups, what they hold alone and what it adds
/// up to.
pub async fn access_list(State(desk): State<Shared>, headers: HeaderMap) -> Response {
    answer((|| {
        reader(&desk, &headers)?;
        Ok(axum::Json(json!({
            "mode": desk.config.mode.to_string(),
            "sessions_open": desk.store.open_sessions(),
            "people": rows(&desk),
        }))
        .into_response())
    })())
}

/// `PUT /desk/access/{subject} {groups, grants, detail}` (identity:work): a
/// person's groups and what they hold alone, replaced.
pub async fn access_set(
    State(desk): State<Shared>,
    headers: HeaderMap,
    Path(subject): Path<String>,
    body: String,
) -> Response {
    answer((|| {
        changer(&desk, &headers)?;
        let doc = body_of(&body)?;
        let change = Change::Access {
            subject: subject.clone(),
            groups: ids(&doc, "groups", true)?,
            grants: grants_of(&doc, true)?,
            detail: detail(&doc)?,
        };
        desk.store.change(oidc(&desk), change).map_err(refused)?;
        Ok(axum::Json(person_row(&desk, &subject)?).into_response())
    })())
}

/// `POST /desk/users {username, password, display, groups, grants, detail}`
/// (identity:work, `local` mode): a person the desk keeps, and the row the
/// identity page lists them by. For one release a body naming
/// `entitlements` gives each one's set as the person's own.
pub async fn users_add(State(desk): State<Shared>, headers: HeaderMap, body: String) -> Response {
    answer((|| {
        local_only(&desk)?;
        changer(&desk, &headers)?;
        let doc = body_of(&body)?;
        let (Some(u), Some(p)) = (doc["username"].as_str(), doc["password"].as_str()) else {
            return Err(bad("username and password"));
        };
        let given = users::Given {
            groups: ids(&doc, "groups", false)?,
            grants: strings(&doc, "grants", false)?,
            detail: detail(&doc)?,
            entitlements: strings(&doc, "entitlements", false)?,
            admin: false,
        };
        users::add(&desk.store, u, p, doc["display"].as_str(), &given).map_err(bad)?;
        Ok((StatusCode::CREATED, axum::Json(person_row(&desk, u)?)).into_response())
    })())
}

// --- the users doors of the ladder, for one release

/// `GET /desk/users` (identity:see, `local` mode): each user with the
/// entitlements that stand for what they hold.
pub async fn users_list(State(desk): State<Shared>, headers: HeaderMap) -> Response {
    answer((|| {
        local_only(&desk)?;
        reader(&desk, &headers)?;
        let book = desk.store.book();
        let seen = desk.store.last_seen();
        let list: Vec<Value> = desk
            .store
            .users()
            .into_iter()
            .map(|u| {
                let access = book.resolve(&u.username, None).access;
                let last = seen.get(&u.username).cloned();
                json!({
                    "username": u.username,
                    "display": u.display,
                    "entitlements": grants::entitlements_of(&access),
                    "admin": access.holds_name("admin"),
                    "last_seen": last,
                })
            })
            .collect();
        Ok(axum::Json(json!({
            "users": list,
            "entitlements": users::ENTITLEMENTS,
            "sessions_open": desk.store.open_sessions(),
        }))
        .into_response())
    })())
}

/// `PUT /desk/users/{name}/entitlements {entitlements}` (identity:work,
/// `local` mode): what the person holds becomes the entitlements' sets, as
/// their own, and they leave their groups.
pub async fn users_entitlements(
    State(desk): State<Shared>,
    headers: HeaderMap,
    Path(name): Path<String>,
    body: String,
) -> Response {
    answer((|| {
        local_only(&desk)?;
        changer(&desk, &headers)?;
        let doc = body_of(&body)?;
        let entitlements = strings(&doc, "entitlements", true)?;
        users::check_entitlements(&entitlements).map_err(bad)?;
        let sets = grants::of_names(entitlements.iter().map(String::as_str));
        let change = Change::Access {
            subject: name.clone(),
            groups: Vec::new(),
            grants: sets.grants,
            detail: (!entitlements.is_empty()).then_some(sets.detail),
        };
        desk.store.change(false, change).map_err(refused)?;
        let access = desk.store.access(&name, None).access;
        Ok(axum::Json(json!({
            "username": name,
            "entitlements": grants::entitlements_of(&access),
        }))
        .into_response())
    })())
}

// --- the people on this desk, for choosing whom to share a conversation with (the chat, slice 5)

/// The people a person may name when sharing a conversation: everyone the desk
/// keeps in `local` mode, and everyone who has signed in at least once in
/// `oidc` mode, by subject and display name, never the person asking. A person
/// holding `assistant:use` asks; a desk nobody signs in to has one person and
/// lists nobody.
pub async fn people_list(State(desk): State<Shared>, headers: HeaderMap) -> Response {
    answer((|| {
        if desk.config.mode == Mode::Off {
            return Err(Box::new(error(
                StatusCode::NOT_FOUND,
                "a desk nobody signs in to has one person",
            )));
        }
        let me = session::holding(
            &desk,
            &headers,
            "assistant:use",
            "listing the people on the desk",
        )?;
        let mut people = std::collections::BTreeMap::<String, String>::new();
        if desk.config.mode == Mode::Local {
            for u in desk.store.users() {
                people.insert(u.username, u.display);
            }
        } else {
            for (subject, display, _) in desk.store.people() {
                people.insert(subject, display);
            }
        }
        people.remove(&me.subject);
        let mut list: Vec<(String, String)> = people.into_iter().collect();
        list.sort_by(|a, b| {
            a.1.to_lowercase()
                .cmp(&b.1.to_lowercase())
                .then_with(|| a.0.cmp(&b.0))
        });
        let out: Vec<Value> = list
            .into_iter()
            .map(|(subject, display)| json!({"subject": subject, "display": display}))
            .collect();
        Ok(axum::Json(json!({ "people": out })).into_response())
    })())
}
