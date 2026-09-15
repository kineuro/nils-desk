// SPDX-License-Identifier: AGPL-3.0-only

//! Groups in the desk's store: an install that knew the ladder's
//! entitlements becomes four groups once, what a person's groups give and
//! what they hold alone add up, and no change leaves nobody who may change
//! people and groups.

use std::collections::BTreeSet;

use nils_desk::grants::{self, Access, Detail};
use nils_desk::store::{Change, Claims, Refused, Store};
use rusqlite::params;
use serde_json::Value;

/// The store as 1.0.0-alpha.27 left it.
const BEFORE_GROUPS: &str = "
    CREATE TABLE session (id TEXT PRIMARY KEY, subject TEXT NOT NULL, display TEXT NOT NULL, entitlements TEXT NOT NULL DEFAULT '[]', tokens TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE person (subject TEXT PRIMARY KEY, display TEXT NOT NULL, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);
    CREATE TABLE user (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL, display TEXT NOT NULL, entitlements TEXT NOT NULL DEFAULT '[]', admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE pending (state TEXT PRIMARY KEY, verifier TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE result (handle INTEGER PRIMARY KEY, document INTEGER NOT NULL, subject TEXT NOT NULL, made_at TEXT NOT NULL);
    CREATE TABLE lineage (document INTEGER PRIMARY KEY, parent INTEGER NOT NULL, subject TEXT NOT NULL, made_at TEXT NOT NULL);
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO meta (key, value) VALUES ('sign_in', 'local http://127.0.0.1:7200 nils');
";

fn vectors() -> Value {
    serde_json::from_str(include_str!("vectors/grants.json")).expect("the vectors parse")
}

/// One of the vectors' sets, as the desk holds it.
fn set_of(v: &Value, name: &str) -> Access {
    let s = &v["sets"][name];
    Access::new(
        s["grants"]
            .as_array()
            .unwrap()
            .iter()
            .map(|g| g.as_str().unwrap()),
        Detail::parse(s["detail"].as_str().unwrap()).unwrap(),
    )
}

fn id_of(store: &Store, name: &str) -> i64 {
    store
        .book()
        .group_named(name)
        .unwrap_or_else(|| panic!("a group named {name}"))
        .id
}

fn grant_set(list: &[&str]) -> BTreeSet<String> {
    grants::normalise(list.iter().copied())
}

fn fresh() -> (Store, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("desk.sqlite")).unwrap();
    (store, dir)
}

#[test]
fn an_install_that_knew_the_ladder_becomes_four_groups_once() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("desk.sqlite");
    {
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch(BEFORE_GROUPS).unwrap();
        for (username, entitlements, admin) in [
            ("anna", r#"["admin", "assist"]"#, 1),
            ("bo", r#"["reader", "reviewer"]"#, 0),
            ("cy", r#"["operator"]"#, 0),
            ("di", r#"["assist"]"#, 0),
            ("ed", "[]", 0),
            ("fy", r#"["admin"]"#, 1),
            ("gu", "[]", 1),
        ] {
            conn.execute(
                "INSERT INTO user (username, password_hash, display, entitlements, admin, created_at) VALUES (?1, 'not a hash', ?1, ?2, ?3, '2026-09-01T00:00:00Z')",
                params![username, entitlements, admin],
            )
            .unwrap();
        }
    }
    let v = vectors();
    let store = Store::open(&path).unwrap();
    let book = store.book();
    let names: Vec<&str> = book.groups.iter().map(|g| g.name.as_str()).collect();
    assert_eq!(names, ["Readers", "Reviewers", "Operators", "Admins"]);
    for (name, step) in [
        ("Readers", "reader"),
        ("Reviewers", "reviewer"),
        ("Operators", "operator"),
    ] {
        assert_eq!(
            book.group_named(name).unwrap().access,
            set_of(&v, step),
            "{name}"
        );
    }
    let mut admins = set_of(&v, "admin");
    admins.add(&set_of(&v, "assist"));
    assert_eq!(admins, Access::everything());
    assert_eq!(
        book.group_named("Admins").unwrap().access,
        admins,
        "Admins hold the assistant too"
    );
    assert!(book.groups.iter().all(|g| g.follows.is_empty()));

    // each person in the group of their top step
    let groups_of = |who: &str| book.names(&book.resolve(who, None).member);
    assert_eq!(groups_of("anna"), ["Admins"]);
    assert_eq!(groups_of("bo"), ["Reviewers"], "the top step");
    assert_eq!(groups_of("cy"), ["Operators"]);
    assert!(groups_of("di").is_empty());
    assert!(groups_of("ed").is_empty());
    assert_eq!(groups_of("fy"), ["Admins"]);
    assert!(groups_of("gu").is_empty(), "user.admin is no longer read");
    // and assist as their own grant
    for who in ["anna", "di"] {
        let r = book.resolve(who, None);
        assert_eq!(r.own, grant_set(&["assistant:use"]), "{who}");
        assert_eq!(r.own_detail, None, "{who}");
    }
    for who in ["bo", "cy", "ed", "fy", "gu"] {
        assert!(book.resolve(who, None).own.is_empty(), "{who}");
    }
    assert_eq!(book.resolve("anna", None).access, Access::everything());
    assert_eq!(book.resolve("bo", None).access, set_of(&v, "reviewer"));
    assert_eq!(book.resolve("cy", None).access, set_of(&v, "operator"));
    assert_eq!(book.resolve("di", None).access, set_of(&v, "assist"));
    assert!(book.resolve("ed", None).access.is_empty());
    assert_eq!(book.resolve("fy", None).access, Access::everything());
    drop(store);

    // once: a group an admin removed is not made again at the next start
    let store = Store::open(&path).unwrap();
    store
        .change(
            false,
            Change::GroupRemove {
                id: id_of(&store, "Readers"),
            },
        )
        .unwrap();
    drop(store);
    let store = Store::open(&path).unwrap();
    let book = store.book();
    assert!(book.group_named("Readers").is_none());
    assert_eq!(book.groups.len(), 3);
    assert_eq!(book.names(&book.resolve("anna", None).member), ["Admins"]);
}

#[test]
fn a_fresh_store_starts_with_the_four_groups_and_nobody_in_them() {
    let (store, _dir) = fresh();
    let book = store.book();
    let names: Vec<&str> = book.groups.iter().map(|g| g.name.as_str()).collect();
    assert_eq!(names, ["Readers", "Reviewers", "Operators", "Admins"]);
    assert!(book.members.is_empty());
    assert!(book.own.is_empty());
}

#[test]
fn what_groups_give_and_what_a_person_holds_alone_add_up() {
    let v = vectors();
    let (store, _dir) = fresh();
    store
        .user_add("anna", "not a hash", "Anna", &[], false)
        .unwrap();
    let scanner = store
        .change(
            false,
            Change::GroupAdd {
                name: "  Scanner people ".into(),
                access: Access::new(["data:work"], Detail::Quasi),
                follows: vec![],
            },
        )
        .unwrap()
        .expect("the group's id");
    assert_eq!(store.book().group(scanner).unwrap().name, "Scanner people");
    let readers = id_of(&store, "Readers");
    let give = |groups: Vec<i64>, own: &[&str], detail: Option<Detail>| Change::Access {
        subject: "anna".into(),
        groups,
        grants: grant_set(own),
        detail,
    };
    store
        .change(
            false,
            give(vec![scanner, readers, readers], &["kvasir:work"], None),
        )
        .unwrap();
    let r = store.access("anna", None);
    assert_eq!(r.member, [readers, scanner]);
    assert_eq!(
        r.access.list(),
        [
            "data:see",
            "data:work",
            "kvasir:see",
            "kvasir:work",
            "query:see",
            "query:work"
        ]
    );
    assert_eq!(r.access.detail, Detail::Quasi, "the higher of the details");
    // a detail of one's own above the groups' holds; one below takes nothing away
    store
        .change(
            false,
            give(
                vec![readers, scanner],
                &["kvasir:work"],
                Some(Detail::Sensitive),
            ),
        )
        .unwrap();
    assert_eq!(store.access("anna", None).access.detail, Detail::Sensitive);
    store
        .change(
            false,
            give(
                vec![readers, scanner],
                &["kvasir:work"],
                Some(Detail::Plain),
            ),
        )
        .unwrap();
    assert_eq!(store.access("anna", None).access.detail, Detail::Quasi);
    // a change to a group applies to everyone in it at once
    store
        .change(
            false,
            Change::GroupSet {
                id: readers,
                name: "Readers".into(),
                access: Access::new(["query:see"], Detail::Plain),
                follows: vec![],
            },
        )
        .unwrap();
    let r = store.access("anna", None);
    assert!(r.access.holds("query:see") && !r.access.holds("query:work"));

    // under oidc a group reaches everyone in a provider group it follows
    let ops = store
        .change(
            true,
            Change::GroupAdd {
                name: "Ops".into(),
                access: set_of(&v, "operator"),
                follows: vec!["neuro-ops".into(), " neuro-ops".into(), " ".into()],
            },
        )
        .unwrap()
        .unwrap();
    assert_eq!(store.book().group(ops).unwrap().follows, ["neuro-ops"]);
    let claims = Claims {
        groups: vec!["staff".into(), "neuro-ops".into()],
        ..Default::default()
    };
    let r = store.access("8c1f2a", Some(&claims));
    assert_eq!(r.followed, [ops]);
    assert!(r.member.is_empty());
    assert_eq!(r.access, set_of(&v, "operator"));
    // without the provider's word, as in local mode, following reaches nobody
    assert!(store.access("8c1f2a", None).access.is_empty());
    // a legacy entitlement in the roles claim stands for its set
    let legacy = Claims {
        roles: vec!["reviewer".into(), "assist".into(), "king".into()],
        ..Default::default()
    };
    let mut want = set_of(&v, "reviewer");
    want.add(&set_of(&v, "assist"));
    assert_eq!(store.access("8c1f2a", Some(&legacy)).access, want);
}

#[test]
fn no_change_leaves_nobody_who_may_change_people_and_groups() {
    let (store, _dir) = fresh();
    for name in ["anna", "bo"] {
        store
            .user_add(name, "not a hash", name, &[], false)
            .unwrap();
    }
    let admins = id_of(&store, "Admins");
    let readers = id_of(&store, "Readers");
    let to = |subject: &str, groups: Vec<i64>, own: &[&str]| Change::Access {
        subject: subject.into(),
        groups,
        grants: grant_set(own),
        detail: None,
    };
    // nobody holds identity:work yet, so nothing is guarded: the first admin is made
    store.change(false, to("anna", vec![admins], &[])).unwrap();
    // anna alone holds it: leaving Admins, removing Admins, or Admins without it, is refused
    assert_eq!(
        store.change(false, to("anna", vec![readers], &["identity:see"])),
        Err(Refused::Nobody)
    );
    assert_eq!(
        store.change(false, Change::GroupRemove { id: admins }),
        Err(Refused::Nobody)
    );
    let mut less = Access::everything();
    less.grants.remove("identity:work");
    assert_eq!(
        store.change(
            false,
            Change::GroupSet {
                id: admins,
                name: "Admins".into(),
                access: less,
                follows: vec![],
            }
        ),
        Err(Refused::Nobody)
    );
    assert!(store.access("anna", None).access.holds("identity:work"));
    // with bo holding it on their own, Admins may go
    store
        .change(false, to("bo", vec![], &["identity:work"]))
        .unwrap();
    store
        .change(false, Change::GroupRemove { id: admins })
        .unwrap();
    assert!(store.access("bo", None).access.holds("identity:see"));
    assert!(store.access("anna", None).access.is_empty());

    // refusals by name
    assert!(matches!(
        store.change(false, to("zed", vec![], &[])),
        Err(Refused::Unknown(_))
    ));
    assert!(matches!(
        store.change(false, to("bo", vec![999], &["identity:work"])),
        Err(Refused::Invalid(_))
    ));
    let named = |name: &str| Access::new([name], Detail::Plain);
    assert!(matches!(
        store.change(
            false,
            Change::GroupSet {
                id: 999,
                name: "Nine".into(),
                access: named("query:see"),
                follows: vec![]
            }
        ),
        Err(Refused::Unknown(_))
    ));
    assert!(matches!(
        store.change(false, Change::GroupRemove { id: 999 }),
        Err(Refused::Unknown(_))
    ));
    for taken in ["Readers", "  "] {
        assert!(matches!(
            store.change(
                false,
                Change::GroupAdd {
                    name: taken.into(),
                    access: named("query:see"),
                    follows: vec![]
                }
            ),
            Err(Refused::Invalid(_))
        ));
    }
    assert!(matches!(
        store.change(
            false,
            Change::GroupSet {
                id: readers,
                name: "Operators".into(),
                access: named("query:see"),
                follows: vec![]
            }
        ),
        Err(Refused::Invalid(_))
    ));

    // under oidc the people counted are those who signed in, with what their provider said last
    store.saw(
        "8c1f2a",
        "Anna",
        &Claims {
            groups: vec!["neuro-admins".into()],
            ..Default::default()
        },
    );
    let heads = store
        .change(
            true,
            Change::GroupAdd {
                name: "Heads".into(),
                access: Access::everything(),
                follows: vec!["neuro-admins".into()],
            },
        )
        .unwrap()
        .unwrap();
    assert_eq!(
        store.change(
            true,
            Change::GroupSet {
                id: heads,
                name: "Heads".into(),
                access: Access::everything(),
                follows: vec![],
            }
        ),
        Err(Refused::Nobody)
    );
}
