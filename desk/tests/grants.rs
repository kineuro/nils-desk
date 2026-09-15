// SPDX-License-Identifier: AGPL-3.0-only

//! The shared grants vectors (`contracts/suite/v2/vectors/grants.json`,
//! copied verbatim to `tests/vectors/grants.json`), run where the desk meets
//! them: the ladder's sets, which the migration makes its groups from; a
//! list of names, as `--entitlement` and a legacy entitlement give them.

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

#[test]
fn a_list_of_names_stands_for_its_sets_and_grants() {
    let v = vectors();
    for case in v["named"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let got = grants::of_names(case["roles"].as_str().unwrap().split(','));
        matches(name, &case["expect"], &got);
    }
}
