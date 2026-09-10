// SPDX-License-Identifier: AGPL-3.0-only

//! The `nils-desk` command line: serve, or check the engine's contracts.

use std::net::SocketAddr;

use clap::{Parser, Subcommand};
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
    /// The local users of `local` mode (Wave 4c section 5.1)
    #[command(subcommand)]
    User(UserCommand),
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
        /// An entitlement, repeatable: reader, reviewer, operator, admin, assist
        #[arg(long = "entitlement", value_name = "NAME")]
        entitlements: Vec<String>,
        /// The first user: an admin, who grants the rest on the settings page
        #[arg(long)]
        admin: bool,
    },
    /// The users and their entitlements
    List {
        #[arg(long, value_name = "FILE", default_value = "nils-desk.toml")]
        config: std::path::PathBuf,
    },
    /// Set a user's entitlements, replacing them
    Grant {
        #[arg(long, value_name = "FILE", default_value = "nils-desk.toml")]
        config: std::path::PathBuf,
        username: String,
        #[arg(long = "entitlement", value_name = "NAME")]
        entitlements: Vec<String>,
    },
    /// Set a user's password, read from stdin
    Password {
        #[arg(long, value_name = "FILE", default_value = "nils-desk.toml")]
        config: std::path::PathBuf,
        username: String,
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
        Command::User(c) => user(c),
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

fn user(command: UserCommand) -> i32 {
    let run = || -> Result<(), String> {
        match command {
            UserCommand::Add {
                config,
                username,
                display,
                entitlements,
                admin,
            } => {
                let desk = load(&config)?;
                let password = read_password()?;
                nils_desk::users::add(
                    &desk.store,
                    &username,
                    &password,
                    display.as_deref(),
                    &entitlements,
                    admin,
                )?;
                println!("added {username}{}", if admin { " (admin)" } else { "" });
                Ok(())
            }
            UserCommand::List { config } => {
                let desk = load(&config)?;
                for u in desk.store.users() {
                    println!(
                        "{:<20} {:<24} {}{}",
                        u.username,
                        u.display,
                        u.entitlements.join(","),
                        if u.admin { " admin" } else { "" }
                    );
                }
                Ok(())
            }
            UserCommand::Grant {
                config,
                username,
                entitlements,
            } => {
                let desk = load(&config)?;
                nils_desk::users::check_entitlements(&entitlements)?;
                if !desk.store.user_set_entitlements(&username, &entitlements)? {
                    return Err(format!("no user named {username}"));
                }
                println!("{username}: {}", entitlements.join(","));
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
    };
    match run() {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("nils-desk: {e}");
            2
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
        };
        let r = nils_desk::register::register(&api, &plan).await?;
        for c in &r.created {
            println!("created {c}");
        }
        for f in &r.found {
            println!("found   {f}");
        }
        println!();
        println!("the engine's flags:");
        println!("  {}", r.flags());
        println!();
        println!("the desk's [oidc] table:");
        println!("  issuer = \"{}\"", r.issuer);
        println!("  client_id = \"{}\"", r.client_id);
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
