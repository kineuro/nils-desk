// SPDX-License-Identifier: AGPL-3.0-only

//! The command line keeps the groups and what each person holds, as setup
//! and an operator use it: `user add --admin` joins Admins, `group
//! add|set|remove` and `user access` change the store the service reads,
//! each change touching only what it names, `--entitlement` and `user
//! grant` still answer for one release, and no change leaves nobody who may
//! change people and groups.

use std::io::Write;
use std::process::{Command, Stdio};

use nils_desk::grants::{self, Access, Detail};
use nils_desk::store::Store;

const CONFIG: &str = "origin = \"http://127.0.0.1:7200\"\nmode = \"local\"\nstore = \"nils-desk.sqlite\"\n[local]\nkey = \"nils-desk.key\"\n[engine]\nurl = \"http://127.0.0.1:9\"\n";

struct Ran {
    code: i32,
    out: String,
    err: String,
}

/// `nils-desk ARGS --config DIR/nils-desk.toml`, with a line on stdin when given.
fn nils_desk(dir: &std::path::Path, args: &[&str], stdin: Option<&str>) -> Ran {
    let mut child = Command::new(env!("CARGO_BIN_EXE_nils-desk"))
        .args(args)
        .arg("--config")
        .arg(dir.join("nils-desk.toml"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("the binary runs");
    if let (Some(line), Some(mut pipe)) = (stdin, child.stdin.take()) {
        // a command refused before it reads stdin closes the pipe first
        let _ = pipe.write_all(line.as_bytes());
    }
    let out = child.wait_with_output().expect("the binary ends");
    Ran {
        code: out.status.code().unwrap_or(-1),
        out: String::from_utf8_lossy(&out.stdout).into_owned(),
        err: String::from_utf8_lossy(&out.stderr).into_owned(),
    }
}

#[test]
fn the_command_line_keeps_groups_and_what_each_person_holds() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("nils-desk.toml"), CONFIG).unwrap();
    let run = |args: &[&str], stdin: Option<&str>| nils_desk(dir.path(), args, stdin);
    let ok = |args: &[&str], stdin: Option<&str>| {
        let r = run(args, stdin);
        assert_eq!(r.code, 0, "{args:?}: {}", r.err);
        r
    };
    let refused = |args: &[&str], stdin: Option<&str>, says: &str| {
        let r = run(args, stdin);
        assert_eq!(r.code, 2, "{args:?}: {}", r.out);
        assert!(r.err.contains(says), "{args:?}: {}", r.err);
    };
    let store = || Store::open(&dir.path().join("nils-desk.sqlite")).unwrap();
    let names = |subject: &str| {
        let s = store();
        let book = s.book();
        book.names(&book.resolve(subject, None).member)
    };

    // setup's first person joins Admins, and may do everything, the assistant too
    let r = ok(
        &["user", "add", "anna", "--admin"],
        Some("correct horse battery\n"),
    );
    assert!(r.out.contains("added anna (admin)"), "{}", r.out);
    assert_eq!(store().access("anna", None).access, Access::everything());
    assert_eq!(names("anna"), ["Admins"]);

    // a group with grants, a detail and a provider group it follows
    ok(
        &[
            "group",
            "add",
            "Scanner people",
            "--grant",
            "data:work",
            "--grant",
            "review:see",
            "--detail",
            "quasi",
            "--follows",
            "neuro-scanner",
        ],
        None,
    );
    refused(
        &["group", "add", "Coffee", "--grant", "coffee:work"],
        None,
        "coffee:work is not a grant",
    );
    refused(&["group", "add", "Readers"], None, "exists");
    refused(
        &["group", "add", "All", "--detail", "everything"],
        None,
        "not a detail",
    );
    let r = ok(&["group", "list"], None);
    assert_eq!(r.out.lines().count(), 5, "{}", r.out);
    let line = r
        .out
        .lines()
        .find(|l| l.starts_with("Scanner people"))
        .unwrap();
    assert!(
        line.contains("quasi")
            && line.contains("neuro-scanner")
            && line.contains("data:see,data:work,review:see"),
        "{line}"
    );

    // a person with a group and a grant of their own; a group that is not there
    // is refused before the password is asked for, and nobody is added
    ok(
        &[
            "user",
            "add",
            "bo",
            "--display",
            "Bo",
            "--group",
            "Scanner people",
            "--grant",
            "assistant:use",
        ],
        Some("another long password\n"),
    );
    let bo = store().access("bo", None);
    assert_eq!(names("bo"), ["Scanner people"]);
    assert_eq!(
        bo.access.list(),
        ["assistant:use", "data:see", "data:work", "review:see"]
    );
    assert_eq!(bo.access.detail, Detail::Quasi);
    refused(
        &["user", "add", "cy", "--group", "Nobody's"],
        Some("a third long password\n"),
        "no group named Nobody's",
    );
    assert!(store().user("cy").is_none());
    // --entitlement stands for its set, as the person's own, for one release
    ok(
        &["user", "add", "dy", "--entitlement", "reviewer"],
        Some("a fourth long password\n"),
    );
    assert_eq!(
        store().access("dy", None).access,
        grants::set("reviewer").unwrap()
    );

    // the list shows each person's groups and what they hold
    let r = ok(&["user", "list"], None);
    assert_eq!(r.out.lines().count(), 3, "{}", r.out);
    let line = r.out.lines().find(|l| l.starts_with("bo ")).unwrap();
    assert!(
        line.contains("Bo") && line.contains("Scanner people") && line.contains("quasi"),
        "{line}"
    );
    assert!(line.contains("assistant:use"), "{line}");

    // user access changes only what it names: bo's groups and detail here,
    // and the grant bo holds alone stays
    let r = ok(
        &[
            "user",
            "access",
            "bo",
            "--group",
            "Readers",
            "--detail",
            "sensitive",
        ],
        None,
    );
    assert!(
        r.out.starts_with("bo: Readers") && r.out.contains("sensitive"),
        "{}",
        r.out
    );
    let bo = store().access("bo", None);
    assert_eq!(names("bo"), ["Readers"]);
    assert_eq!(bo.own, grants::normalise(["assistant:use"]));
    assert_eq!(bo.own_detail, Some(Detail::Sensitive));
    let mut want = grants::set("reader").unwrap();
    want.add(&Access::new(["assistant:use"], Detail::Sensitive));
    assert_eq!(bo.access, want);
    // the grants alone, leaving the groups and the detail
    ok(
        &[
            "user",
            "access",
            "bo",
            "--grant",
            "kvasir:see",
            "--grant",
            "query:see",
        ],
        None,
    );
    let bo = store().access("bo", None);
    assert_eq!(names("bo"), ["Readers"]);
    assert_eq!(bo.own, grants::normalise(["kvasir:see", "query:see"]));
    assert_eq!(bo.own_detail, Some(Detail::Sensitive));
    // naming nothing is refused, saying what to name; --none goes with nothing else
    let r = run(&["user", "access", "bo"], None);
    assert_eq!(r.code, 2, "{}", r.out);
    for flag in ["--group", "--grant", "--detail", "--none"] {
        assert!(r.err.contains(flag), "{flag}: {}", r.err);
    }
    let r = run(
        &["user", "access", "bo", "--none", "--group", "Readers"],
        None,
    );
    assert_eq!(r.code, 2, "{}", r.out);
    assert!(r.err.contains("cannot be used with"), "{}", r.err);
    assert_eq!(
        names("bo"),
        ["Readers"],
        "a refused command changes nothing"
    );
    // --none takes every group, grant and detail of bo's own away
    ok(&["user", "access", "bo", "--none"], None);
    let bo = store().access("bo", None);
    assert!(names("bo").is_empty() && bo.own.is_empty() && bo.own_detail.is_none());
    assert!(bo.access.is_empty());
    // user grant still answers, with entitlements, for one release: the sets
    // become what the person holds, as they did, their groups too
    ok(&["user", "access", "dy", "--group", "Scanner people"], None);
    ok(&["user", "grant", "dy", "--entitlement", "operator"], None);
    assert_eq!(
        store().access("dy", None).access,
        grants::set("operator").unwrap()
    );
    assert!(names("dy").is_empty());

    // group set replaces what a group gives and follows
    ok(&["group", "set", "Readers", "--grant", "query:see"], None);
    let readers = store().book().group_named("Readers").unwrap().clone();
    assert_eq!(readers.access, Access::new(["query:see"], Detail::Plain));
    assert!(readers.follows.is_empty());

    // anna alone may change people and groups: none of these may leave nobody who can
    refused(&["group", "remove", "Admins"], None, "identity:work");
    refused(
        &["group", "set", "Admins", "--grant", "query:see"],
        None,
        "identity:work",
    );
    refused(&["user", "access", "anna", "--none"], None, "identity:work");
    refused(
        &["user", "access", "anna", "--group", "Readers"],
        None,
        "identity:work",
    );
    assert_eq!(names("anna"), ["Admins"]);
    refused(
        &["user", "access", "zed", "--none"],
        None,
        "no user named zed",
    );
    refused(
        &["group", "remove", "Nothing"],
        None,
        "no group named Nothing",
    );
    // once dy holds identity:work on their own, Admins may go
    ok(&["user", "access", "dy", "--grant", "identity:work"], None);
    ok(&["group", "remove", "Admins"], None);
    let r = ok(&["group", "list"], None);
    assert!(!r.out.contains("Admins"), "{}", r.out);
    assert!(store().access("anna", None).access.is_empty());

    // --admin makes Admins again where the install has none, as setup relies on
    ok(
        &["user", "add", "ed", "--admin"],
        Some("a fifth long password\n"),
    );
    assert_eq!(names("ed"), ["Admins"]);
    assert_eq!(store().access("ed", None).access, Access::everything());
    ok(&["user", "password", "ed"], Some("a new long password\n"));
}
