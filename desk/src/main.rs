// SPDX-License-Identifier: AGPL-3.0-only

//! The `nils-desk` command line: serve, check the engine's contracts, keep
//! the people and the groups they are given pages by, and register the desk
//! at a provider.

use std::net::SocketAddr;

use clap::{Parser, Subcommand};
use nils_desk::config::Mode;
use nils_desk::grants::Access;
use nils_desk::store::{Change, Claims};
use nils_desk::users::Given;
use nils_desk::{OPENAPI, SUITE, Shared, VERSION, capabilities, router};

#[derive(Debug, Parser)]
#[command(
    name = "nils-desk",
    version,
    about = "The desk of NILS: one origin, the session, the proxy and the deployment capabilities document"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Serve the desk on the configured bind address
    Serve {
        #[arg(long, value_name = "FILE", default_value = "nils-desk.toml")]
        config: std::path::PathBuf,
    },
    /// Check the engine's contract versions against this desk's and exit
    Check {
        #[arg(long, value_name = "FILE", default_value = "nils-desk.toml")]
        config: std::path::PathBuf,
    },
    /// The people of the desk: its local users, and what each person holds
    #[command(subcommand)]
    User(UserCommand),
    /// The groups people are given pages by
    #[command(subcommand)]
    Group(GroupCommand),
    /// Register the desk at an Authentik provider, idempotently (section 5.7)
    Register(RegisterArgs),
}

#[derive(Debug, Subcommand)]
enum UserCommand {
    /// Add a user; the password is read from stdin (one line)
    Add {
        #[arg(long, value_name = "FILE", default_value = "nils-desk.toml")]
        config: std::path::PathBuf,
        username: String,
        #[arg(long)]
        display: Option<String>,
        /// A group the person joins, by name, repeatable
        #[arg(long = "group", value_name = "GROUP")]
        groups: Vec<String>,
        /// A grant the person holds alone, such as query:work, repeatable
        #[arg(long = "grant", value_name = "GRANT")]
        grants: Vec<String>,
        /// What they see in records, on their own: plain, quasi or sensitive
        #[arg(long, value_name = "DETAIL")]
        detail: Option<String>,
        /// The first person: joins Admins, who may do everything, the assistant too
        #[arg(long)]
        admin: bool,
        /// A ladder name (reader, reviewer, operator, admin, assist), repeatable, standing for its set as the person's own; for one release
        #[arg(long = "entitlement", value_name = "NAME")]
        entitlements: Vec<String>,
    },
    /// The people, their groups and what they hold
    List {
        #[arg(long, value_name = "FILE", default_value = "nils-desk.toml")]
        config: std::path::PathBuf,
    },
    /// Set what a person holds: their groups, their grants and their detail, all replaced
    #[command(alias = "grant")]
    Access {
        #[arg(long, value_name = "FILE", default_value = "nils-desk.toml")]
        config: std::path::PathBuf,
        username: String,
        /// A group the person is in, by name, repeatable
        #[arg(long = "group", value_name = "GROUP")]
        groups: Vec<String>,
        /// A grant the person holds alone, repeatable
        #[arg(long = "grant", value_name = "GRANT")]
        grants: Vec<String>,
        /// What they see in records, on their own: plain, quasi or sensitive
        #[arg(long, value_name = "DETAIL")]
        detail: Option<String>,
        /// A ladder name standing for its set, as `user grant` took it; for one release
        #[arg(long = "entitlement", value_name = "NAME", hide = true)]
        entitlements: Vec<String>,
    },
    /// Set a user's password, read from stdin
    Password {
        #[arg(long, value_name = "FILE", default_value = "nils-desk.toml")]
        config: std::path::PathBuf,
        username: String,
    },
}

#[derive(Debug, Subcommand)]
enum GroupCommand {
    /// The groups: what each gives, who is in it and the provider groups it follows
    List {
        #[arg(long, value_name = "FILE", default_value = "nils-desk.toml")]
        config: std::path::PathBuf,
    },
    /// Make a group
    Add {
        #[arg(long, value_name = "FILE", default_value = "nils-desk.toml")]
        config: std::path::PathBuf,
        name: String,
        /// A grant the group gives, such as query:work, repeatable
        #[arg(long = "grant", value_name = "GRANT")]
        grants: Vec<String>,
        /// What its people see in records: plain, quasi or sensitive
        #[arg(long, value_name = "DETAIL")]
        detail: Option<String>,
        /// A group at the provider whose people this group reaches, repeatable (oidc mode)
        #[arg(long = "follows", value_name = "GROUP")]
        follows: Vec<String>,
    },
    /// Set what a group gives and follows, all replaced
    Set {
        #[arg(long, value_name = "FILE", default_value = "nils-desk.toml")]
        config: std::path::PathBuf,
        name: String,
        /// A grant the group gives, repeatable
        #[arg(long = "grant", value_name = "GRANT")]
        grants: Vec<String>,
        /// What its people see in records: plain, quasi or sensitive
        #[arg(long, value_name = "DETAIL")]
        detail: Option<String>,
        /// A group at the provider whose people this group reaches, repeatable (oidc mode)
        #[arg(long = "follows", value_name = "GROUP")]
        follows: Vec<String>,
    },
    /// Remove a group; its people keep what else they hold
    Remove {
        #[arg(long, value_name = "FILE", default_value = "nils-desk.toml")]
        config: std::path::PathBuf,
        name: String,
    },
}

#[derive(Debug, Parser)]
struct RegisterArgs {
    /// The provider, as https://auth.example.org
    #[arg(long, value_name = "URL")]
    authentik: String,
    /// A file holding an API token of the provider; never a flag value
    #[arg(long, value_name = "FILE")]
    token: std::path::PathBuf,
    /// The desk's origin, whose /desk/callback is the redirect URI
    #[arg(long, value_name = "URL")]
    origin: String,
    /// The application's slug at the provider
    #[arg(long, default_value = "nils")]
    slug: String,
    /// The application's name at the provider
    #[arg(long, default_value = "NILS")]
    name: String,
    /// A group that may use the application, repeatable
    #[arg(long = "allow", value_name = "GROUP")]
    allow: Vec<String>,
    /// An entitlement bound to a group, as reader=GROUP, repeatable
    #[arg(long = "bind", value_name = "ENTITLEMENT=GROUP")]
    bind: Vec<String>,
    /// Where to write the client secret, mode 600, for the desk's [oidc] table
    #[arg(long, value_name = "FILE")]
    secret_file: Option<std::path::PathBuf>,
    /// The audience of the tokens the desk mints, as its [local] table names it
    #[arg(long, default_value = "nils")]
    audience: String,
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();
    let cli = Cli::parse();
    let rt = tokio::runtime::Runtime::new().expect("a runtime");
    let code = match cli.command {
        Command::Serve { config } => rt.block_on(serve(&config)),
        Command::Check { config } => rt.block_on(check(&config)),
        Command::User(c) => answer(user(c)),
        Command::Group(c) => answer(group(c)),
        Command::Register(a) => rt.block_on(register(a)),
    };
    std::process::exit(code);
}

fn load(path: &std::path::Path) -> Result<Shared, String> {
    nils_desk::start_at(path)
}

async fn check(path: &std::path::Path) -> i32 {
    let desk = match load(path) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("nils-desk: {e}");
            return 2;
        }
    };
    match capabilities::engine(&desk).await {
        Ok(caps) => match capabilities::check(&caps) {
            Ok(None) => {
                println!(
                    "the engine speaks openapi {OPENAPI} and suite {SUITE}, as this desk does"
                );
                0
            }
            Ok(Some(m)) => {
                println!("{}", m.message);
                0
            }
            Err(m) => {
                eprintln!("nils-desk: {}", m.message);
                2
            }
        },
        Err(e) => {
            eprintln!(
                "nils-desk: the engine at {} did not answer: {e}",
                desk.config.engine.url
            );
            2
        }
    }
}

async fn serve(path: &std::path::Path) -> i32 {
    let desk = match load(path) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("nils-desk: {e}");
            return 2;
        }
    };
    // The contract check before the first request (Wave 4c §6.7): an
    // unknown major refuses to start, by name; an unreachable engine is a
    // state the shell renders, not a refusal.
    match capabilities::engine(&desk).await {
        Ok(caps) => {
            if let Err(m) = capabilities::check(&caps) {
                eprintln!("nils-desk: {}", m.message);
                return 2;
            }
        }
        // a desk that signs people in holds no token of its own, so an engine that asks for one has answered
        Err(e) if e.contains("401") || e.contains("403") => tracing::info!(
            "the engine at {} answers, and takes the token of a person who signs in",
            desk.config.engine.url
        ),
        Err(e) => tracing::warn!(
            "the engine at {} did not answer: {e}",
            desk.config.engine.url
        ),
    }
    let app = router(desk.clone());
    let listener = match tokio::net::TcpListener::bind(&desk.config.bind).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("nils-desk: cannot bind {}: {e}", desk.config.bind);
            return 2;
        }
    };
    let addr: SocketAddr = listener.local_addr().expect("a bound address");
    println!(
        "nils-desk {VERSION} serving {} as {} in {} mode",
        addr, desk.config.origin, desk.config.mode
    );
    if let Err(e) = axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
    {
        eprintln!("nils-desk: {e}");
        return 1;
    }
    0
}

fn read_password() -> Result<String, String> {
    let mut line = String::new();
    std::io::stdin()
        .read_line(&mut line)
        .map_err(|e| e.to_string())?;
    let p = line.trim_end_matches(['\n', '\r']).to_string();
    if p.is_empty() {
        return Err("a password on stdin, one line".into());
    }
    Ok(p)
}

fn answer(run: Result<(), String>) -> i32 {
    match run {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("nils-desk: {e}");
            2
        }
    }
}

fn oidc(desk: &Shared) -> bool {
    desk.config.mode == Mode::Oidc
}

fn or_dash(s: String) -> String {
    if s.is_empty() { "-".into() } else { s }
}

/// The people the command line lists and changes: the local users, or in
/// `oidc` mode the people who have signed in, with what their provider said
/// at their last sign-in.
fn people(desk: &Shared) -> Vec<(String, String, Option<Claims>)> {
    if oidc(desk) {
        desk.store
            .seen()
            .into_iter()
            .map(|p| (p.subject, p.display, Some(p.claims)))
            .collect()
    } else {
        desk.store
            .users()
            .into_iter()
            .map(|u| (u.username, u.display, None))
            .collect()
    }
}

/// A person's groups, detail and grants, on one line.
fn describe(desk: &Shared, subject: &str) -> String {
    let book = desk.store.book();
    let claims = people(desk)
        .into_iter()
        .find(|(s, _, _)| s == subject)
        .and_then(|(_, _, c)| c);
    let r = book.resolve(subject, claims.as_ref());
    let ids: Vec<i64> = r.member.iter().chain(&r.followed).copied().collect();
    format!(
        "{:<24} {:<9} {}",
        or_dash(book.names(&ids).join(",")),
        r.access.detail.as_str(),
        or_dash(r.access.list().join(","))
    )
}

fn group_id(desk: &Shared, name: &str) -> Result<i64, String> {
    desk.store
        .book()
        .group_named(name)
        .map(|g| g.id)
        .ok_or_else(|| format!("no group named {name}"))
}

/// What a group gives, from the grants and the detail named.
fn gives(grants: &[String], detail: Option<&str>) -> Result<Access, String> {
    Ok(Access {
        grants: nils_desk::grants::check(grants)?,
        detail: nils_desk::grants::check_detail(detail)?.unwrap_or_default(),
    })
}

fn user(command: UserCommand) -> Result<(), String> {
    match command {
        UserCommand::Add {
            config,
            username,
            display,
            groups,
            grants,
            detail,
            admin,
            entitlements,
        } => {
            let desk = load(&config)?;
            let given = Given {
                groups: nils_desk::users::group_ids(&desk.store, &groups)?,
                grants,
                detail: nils_desk::grants::check_detail(detail.as_deref())?,
                entitlements,
                admin,
            };
            // what the person is given is checked before the password is asked for
            given.own()?;
            let password = read_password()?;
            nils_desk::users::add(
                &desk.store,
                &username,
                &password,
                display.as_deref(),
                &given,
            )?;
            println!("added {username}{}", if admin { " (admin)" } else { "" });
            Ok(())
        }
        UserCommand::List { config } => {
            let desk = load(&config)?;
            for (subject, display, _) in people(&desk) {
                println!(
                    "{:<20} {:<24} {}",
                    subject,
                    display,
                    describe(&desk, &subject)
                );
            }
            Ok(())
        }
        UserCommand::Access {
            config,
            username,
            groups,
            grants,
            detail,
            entitlements,
        } => {
            let desk = load(&config)?;
            let given = Given {
                groups: nils_desk::users::group_ids(&desk.store, &groups)?,
                grants,
                detail: nils_desk::grants::check_detail(detail.as_deref())?,
                entitlements,
                admin: false,
            };
            let (own, detail) = given.own()?;
            desk.store
                .change(
                    oidc(&desk),
                    Change::Access {
                        subject: username.clone(),
                        groups: given.groups,
                        grants: own,
                        detail,
                    },
                )
                .map_err(|e| e.to_string())?;
            println!("{username}: {}", describe(&desk, &username));
            Ok(())
        }
        UserCommand::Password { config, username } => {
            let desk = load(&config)?;
            let password = read_password()?;
            if password.len() < 8 {
                return Err("a password is at least eight characters".into());
            }
            if !desk
                .store
                .user_set_password(&username, &nils_desk::users::hash(&password)?)?
            {
                return Err(format!("no user named {username}"));
            }
            println!("{username}: the password is set");
            Ok(())
        }
    }
}

fn group(command: GroupCommand) -> Result<(), String> {
    match command {
        GroupCommand::List { config } => {
            let desk = load(&config)?;
            let book = desk.store.book();
            for g in &book.groups {
                println!(
                    "{:<24} {:<9} {:<24} {:<24} {}",
                    g.name,
                    g.access.detail.as_str(),
                    or_dash(book.members_of(g.id).join(",")),
                    or_dash(g.follows.join(",")),
                    or_dash(g.access.list().join(","))
                );
            }
            Ok(())
        }
        GroupCommand::Add {
            config,
            name,
            grants,
            detail,
            follows,
        } => {
            let desk = load(&config)?;
            let access = gives(&grants, detail.as_deref())?;
            desk.store
                .change(
                    oidc(&desk),
                    Change::GroupAdd {
                        name: name.clone(),
                        access,
                        follows,
                    },
                )
                .map_err(|e| e.to_string())?;
            println!("made {name}");
            Ok(())
        }
        GroupCommand::Set {
            config,
            name,
            grants,
            detail,
            follows,
        } => {
            let desk = load(&config)?;
            let access = gives(&grants, detail.as_deref())?;
            let id = group_id(&desk, &name)?;
            desk.store
                .change(
                    oidc(&desk),
                    Change::GroupSet {
                        id,
                        name: name.clone(),
                        access,
                        follows,
                    },
                )
                .map_err(|e| e.to_string())?;
            println!("{name}: set");
            Ok(())
        }
        GroupCommand::Remove { config, name } => {
            let desk = load(&config)?;
            let id = group_id(&desk, &name)?;
            desk.store
                .change(oidc(&desk), Change::GroupRemove { id })
                .map_err(|e| e.to_string())?;
            println!("removed {name}");
            Ok(())
        }
    }
}

async fn register(a: RegisterArgs) -> i32 {
    let run = async {
        let token =
            std::fs::read_to_string(&a.token).map_err(|e| format!("{}: {e}", a.token.display()))?;
        let mut bind = Vec::new();
        for b in &a.bind {
            let (e, g) = b
                .split_once('=')
                .ok_or_else(|| format!("--bind {b}: ENTITLEMENT=GROUP"))?;
            if !nils_desk::register::ENTITLEMENTS.contains(&e) {
                return Err(format!("--bind {b}: {e} is not an entitlement"));
            }
            bind.push((e.to_string(), g.to_string()));
        }
        let api = nils_desk::register::Api::new(&a.authentik, &token);
        let plan = nils_desk::register::Plan {
            authentik: a.authentik.clone(),
            slug: a.slug.clone(),
            name: a.name.clone(),
            origin: a.origin.clone(),
            allow: a.allow.clone(),
            bind,
            audience: a.audience.clone(),
        };
        let r = nils_desk::register::register(&api, &plan).await?;
        for c in &r.created {
            println!("created {c}");
        }
        for f in &r.found {
            println!("found   {f}");
        }
        println!();
        println!("the engine's flags, trusting the desk beside the provider:");
        println!("  {}", r.flags());
        println!();
        println!("Kvasir's auth, beside the tokens it keeps:");
        println!("  {}", r.kvasir_auth());
        println!();
        println!("the desk's [oidc] table:");
        println!("  issuer = \"{}\"", r.issuer);
        println!("  client_id = \"{}\"", r.client_id);
        println!("  groups_claim = \"groups\"");
        match &a.secret_file {
            Some(f) => {
                write_secret(f, &r.client_secret)?;
                println!("  client_secret_file = \"{}\"", f.display());
            }
            None => println!(
                "  client_secret_file = the file you keep the client secret in; pass --secret-file FILE to have it written, mode 600"
            ),
        }
        Ok::<(), String>(())
    };
    match run.await {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("nils-desk: {e}");
            2
        }
    }
}

fn write_secret(path: &std::path::Path, secret: &str) -> Result<(), String> {
    use std::io::Write;
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut f = opts
        .open(path)
        .map_err(|e| format!("{}: {e}", path.display()))?;
    writeln!(f, "{secret}").map_err(|e| e.to_string())
}
