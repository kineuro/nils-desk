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
    };
    std::process::exit(code);
}

fn load(path: &std::path::Path) -> Result<Shared, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    nils_desk::start(&text)
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
