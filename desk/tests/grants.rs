// SPDX-License-Identifier: AGPL-3.0-only

//! The shared grants vectors (`contracts/suite/v2/vectors/grants.json`,
//! copied verbatim to `tests/vectors/grants.json`), run where the desk meets
//! them: the ladder's sets, which the migration makes its groups from; a
//! list of names, as `--entitlement` and a legacy entitlement give them; a
//! provider's claims; and the subject the desk names a provider's person by.

use nils_desk::grants::{self, Access};
use serde_json::Value;

fn vectors() -> Value {
    serde_json::from_str(include_str!("vectors/grants.json")).expect("the vectors parse")
}

/// An expectation of the vectors against what the desk resolved.
fn matches(name: &str, expect: &Value, got: &Access) {
    if expect["refused"] == true {
        assert!(got.is_empty(), "{name}: refused, but {got:?}");
        return;
    }
    let want: Vec<String> = expect["grants"]
        .as_array()
        .unwrap_or_else(|| panic!("{name}: grants"))
        .iter()
        .map(|g| g.as_str().unwrap().to_string())
        .collect();
    assert_eq!(got.list(), want, "{name}: grants");
    assert_eq!(got.detail.as_str(), expect["detail"], "{name}: detail");
}

#[test]
fn the_ladders_sets_are_the_vectors_sets() {
    let v = vectors();
    let sets = v["sets"].as_object().unwrap();
    assert_eq!(sets.len(), 5, "the four ladder names and assist");
    for (name, expect) in sets {
        let got = grants::set(name).unwrap_or_else(|| panic!("{name} stands for a set"));
        matches(name, expect, &got);
    }
    matches("everything", &v["everything"], &Access::everything());
    assert_eq!(
        v["everything"]["grants"].as_array().unwrap().len(),
        grants::GRANTS.len(),
        "the vocabulary is the schema's"
    );
}

/// The strings of a claim, or none.
fn strings(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|s| s.as_str())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// Under `oidc` the desk resolves a person from what the provider said:
/// each binding of the vectors is a group the admin made that follows the
/// provider group, and the claims' grants and detail are the person's own.
/// The same bindings read a second time as legacy entitlements in the roles
/// claim, each standing for its set, resolve the same.
#[test]
fn a_providers_groups_and_legacy_entitlements_resolve_as_the_vectors_say() {
    use nils_desk::store::{Change, Claims, Store};
    let v = vectors();
    assert_eq!(v["groups_claim"], "groups");
    let roles = v["roles"].as_object().unwrap();
    for case in v["claims"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let claims = &case["claims"];
        let provider = strings(&claims["groups"]);
        let own = grants::normalise(strings(&claims["grants"]).iter().map(String::as_str));
        let own_detail = claims
            .get("detail")
            .map(|d| grants::Detail::read(d.as_str()));
        let legacy: Vec<String> = provider
            .iter()
            .filter_map(|g| roles.get(g).and_then(Value::as_str))
            .map(str::to_string)
            .collect();
        for (pass, groups, bindings) in [
            ("follows", provider.clone(), true),
            ("legacy", Vec::new(), false),
        ] {
            let dir = tempfile::tempdir().unwrap();
            let store = Store::open(&dir.path().join("desk.sqlite")).unwrap();
            if bindings {
                for (group, binding) in roles {
                    store
                        .change(
                            true,
                            Change::GroupAdd {
                                name: format!("{group} at the provider"),
                                access: grants::of_names([binding.as_str().unwrap()]),
                                follows: vec![group.clone()],
                            },
                        )
                        .unwrap();
                }
            }
            let said = Claims {
                groups,
                roles: if bindings { Vec::new() } else { legacy.clone() },
                username: None,
            };
            store.saw("8c1f2a", "Anna", &said);
            store
                .change(
                    true,
                    Change::Access {
                        subject: "8c1f2a".into(),
                        groups: Vec::new(),
                        grants: own.clone(),
                        detail: own_detail,
                    },
                )
                .unwrap();
            let got = store.access("8c1f2a", Some(&said)).access;
            matches(&format!("{name} ({pass})"), &case["expect"], &got);
        }
    }
}

#[test]
fn a_list_of_names_stands_for_its_sets_and_grants() {
    let v = vectors();
    for case in v["named"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let got = grants::of_names(case["roles"].as_str().unwrap().split(','));
        matches(name, &case["expect"], &got);
    }
}

/// Under `oidc` the desk names a provider's person to the parts as the
/// provider's subject at the provider's host, as an entry that keeps no
/// subjects named them before the desk signed for its people; the desk's own
/// entry then keeps that subject as it is. So the cases a desk qualifies run
/// here, and a subject already qualified is left to the entry that keeps it.
#[test]
fn a_providers_subject_is_named_as_an_entry_that_keeps_none_names_it() {
    let v = vectors();
    let mut ran = 0;
    for case in v["principals"].as_array().unwrap() {
        let sub = case["sub"].as_str().unwrap();
        if case["keep_subject"] == true && sub.contains('@') {
            continue;
        }
        let name = case["name"].as_str().unwrap();
        let got = nils_desk::issuer::principal(case["iss"].as_str().unwrap(), sub);
        assert_eq!(got, case["expect"].as_str().unwrap(), "{name}");
        ran += 1;
    }
    assert!(ran >= 2, "the vectors name the subjects a desk qualifies");
}
