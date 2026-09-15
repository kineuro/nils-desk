// SPDX-License-Identifier: AGPL-3.0-only

//! Grants and detail (`contracts/suite/v2/grants.schema.json`): what a
//! person may open, and how much of a record they see. A grant names a page
//! and how far a person goes there: `see`, or `work`, which includes see;
//! the assistant has `use`. Detail is ordered: `plain`, then `quasi` (sex and
//! age, and the viewer's pixels), then `sensitive` (the sensitive class, raw
//! identifiers and burned-in annotation). The ladder's four names and
//! `assist` stand for sets wherever they are still met: a legacy
//! entitlement, `--entitlement`, an app's entitlement, the export setting.

use std::collections::BTreeSet;

use serde_json::{Value, json};

/// Every grant, sorted by code point.
pub const GRANTS: &[&str] = &[
    "assistant-settings:see",
    "assistant-settings:work",
    "assistant:use",
    "audit:see",
    "data:see",
    "data:work",
    "database:see",
    "database:work",
    "identity:see",
    "identity:work",
    "install:see",
    "install:work",
    "kvasir:see",
    "kvasir:work",
    "pipelines:see",
    "pipelines:work",
    "places:see",
    "places:work",
    "query:see",
    "query:work",
    "release:see",
    "release:work",
    "review:see",
    "review:work",
];

/// The ladder's names, lowest first; each stands for its set.
pub const LADDER: &[&str] = &["reader", "reviewer", "operator", "admin"];

/// The name that stands for the assistant.
pub const ASSIST: &str = "assist";

const READER: &[&str] = &["data:see", "query:see", "query:work"];
const REVIEWER: &[&str] = &["pipelines:see", "review:see", "review:work"];
const OPERATOR: &[&str] = &[
    "assistant-settings:see",
    "data:work",
    "install:see",
    "kvasir:see",
    "pipelines:work",
    "places:see",
    "places:work",
    "release:see",
    "release:work",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default)]
pub enum Detail {
    #[default]
    Plain,
    Quasi,
    Sensitive,
}

impl Detail {
    pub const NAMES: &[&str] = &["plain", "quasi", "sensitive"];

    /// A detail by its name; anything else is none.
    pub fn parse(name: &str) -> Option<Detail> {
        match name {
            "plain" => Some(Detail::Plain),
            "quasi" => Some(Detail::Quasi),
            "sensitive" => Some(Detail::Sensitive),
            _ => None,
        }
    }

    /// A claim's detail: absent or unknown reads as plain.
    pub fn read(name: Option<&str>) -> Detail {
        name.and_then(Detail::parse).unwrap_or_default()
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Detail::Plain => "plain",
            Detail::Quasi => "quasi",
            Detail::Sensitive => "sensitive",
        }
    }
}

impl std::fmt::Display for Detail {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// What a person holds: grants, and the detail they see records at.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Access {
    pub grants: BTreeSet<String>,
    pub detail: Detail,
}

impl Access {
    /// Grants from strings, each work with its see and a string outside the
    /// vocabulary dropped.
    pub fn new<'a>(grants: impl IntoIterator<Item = &'a str>, detail: Detail) -> Access {
        Access {
            grants: normalise(grants),
            detail,
        }
    }

    /// Every grant and detail sensitive: `off` mode's one person.
    pub fn everything() -> Access {
        Access::new(GRANTS.iter().copied(), Detail::Sensitive)
    }

    /// What another holds, added: the union of the grants and the higher
    /// detail. Nothing is taken away.
    pub fn add(&mut self, other: &Access) {
        self.grants.extend(other.grants.iter().cloned());
        self.detail = self.detail.max(other.detail);
    }

    /// Whether this holds a grant.
    pub fn holds(&self, grant: &str) -> bool {
        self.grants.contains(grant)
    }

    /// Whether this holds a grant, or a set by its name: every grant of the
    /// set and at least its detail.
    pub fn holds_name(&self, name: &str) -> bool {
        match set(name) {
            Some(s) => s.grants.is_subset(&self.grants) && self.detail >= s.detail,
            None => self.holds(name),
        }
    }

    /// A person holding no grant is refused; detail alone opens nothing.
    pub fn is_empty(&self) -> bool {
        self.grants.is_empty()
    }

    /// The grants, sorted by code point.
    pub fn list(&self) -> Vec<String> {
        self.grants.iter().cloned().collect()
    }

    pub fn as_json(&self) -> Value {
        json!({"grants": self.list(), "detail": self.detail.as_str()})
    }
}

pub fn is_grant(s: &str) -> bool {
    GRANTS.contains(&s)
}

/// A grant, a ladder name or `assist`: what an entitlement setting may name.
pub fn is_name(s: &str) -> bool {
    is_grant(s) || s == ASSIST || LADDER.contains(&s)
}

/// Grants as a part reads them: a work grant with its see, a string outside
/// the vocabulary dropped.
pub fn normalise<'a>(grants: impl IntoIterator<Item = &'a str>) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    for g in grants {
        if !is_grant(g) {
            continue;
        }
        if let Some(page) = g.strip_suffix(":work") {
            out.insert(format!("{page}:see"));
        }
        out.insert(g.to_string());
    }
    out
}

/// Grants a person names for a group or for someone alone: every one in the
/// vocabulary, or the first that is not, by name.
pub fn check<S: AsRef<str>>(grants: &[S]) -> Result<BTreeSet<String>, String> {
    if let Some(bad) = grants.iter().map(AsRef::as_ref).find(|g| !is_grant(g)) {
        return Err(format!("{bad} is not a grant"));
    }
    Ok(normalise(grants.iter().map(AsRef::as_ref)))
}

/// A detail a person names, or none when they named none.
pub fn check_detail(detail: Option<&str>) -> Result<Option<Detail>, String> {
    match detail {
        None => Ok(None),
        Some(d) => Detail::parse(d).map(Some).ok_or_else(|| {
            format!(
                "{d} is not a detail; those are {}",
                Detail::NAMES.join(", ")
            )
        }),
    }
}

/// The set a ladder name or `assist` stands for.
pub fn set(name: &str) -> Option<Access> {
    let (grants, detail): (Vec<&str>, Detail) = match name {
        "reader" => (READER.to_vec(), Detail::Plain),
        "reviewer" => ([READER, REVIEWER].concat(), Detail::Quasi),
        "operator" => ([READER, REVIEWER, OPERATOR].concat(), Detail::Sensitive),
        "admin" => (
            GRANTS
                .iter()
                .copied()
                .filter(|g| *g != "assistant:use")
                .collect(),
            Detail::Sensitive,
        ),
        ASSIST => (vec!["assistant:use"], Detail::Plain),
        _ => return None,
    };
    Some(Access::new(grants, detail))
}

/// A list of names, each a ladder name, `assist` or a grant, as a named
/// token's role list, a legacy entitlement or `--entitlement` gives them:
/// the sets and grants added up, a name outside the vocabulary dropped.
pub fn of_names<'a>(names: impl IntoIterator<Item = &'a str>) -> Access {
    let mut out = Access::default();
    for n in names.into_iter().map(str::trim) {
        match set(n) {
            Some(s) => out.add(&s),
            None if is_grant(n) => out.add(&Access::new([n], Detail::Plain)),
            None => {}
        }
    }
    out
}

/// The highest ladder name whose set this holds, for the doors that still
/// answer in entitlements.
pub fn top_step(access: &Access) -> Option<&'static str> {
    LADDER
        .iter()
        .rev()
        .copied()
        .find(|step| access.holds_name(step))
}

/// The entitlements that stand for what a person holds, for one release:
/// the top ladder name, and `assist` when they use the assistant.
pub fn entitlements_of(access: &Access) -> Vec<String> {
    let mut out: Vec<String> = top_step(access).map(str::to_string).into_iter().collect();
    if access.holds("assistant:use") {
        out.push(ASSIST.to_string());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_vocabulary_is_sorted_and_every_work_has_its_see() {
        let mut sorted = GRANTS.to_vec();
        sorted.sort_unstable();
        assert_eq!(sorted, GRANTS);
        for g in GRANTS {
            if let Some(page) = g.strip_suffix(":work") {
                assert!(is_grant(&format!("{page}:see")), "{g}");
            }
        }
    }

    #[test]
    fn the_ladder_climbs() {
        let mut below = Access::default();
        for step in LADDER {
            let s = set(step).unwrap();
            assert!(below.grants.is_subset(&s.grants), "{step}");
            assert!(below.detail <= s.detail, "{step}");
            assert_eq!(top_step(&s), Some(*step));
            below = s;
        }
    }
}
