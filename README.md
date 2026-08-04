# TodoFlowy Markdown Sync

Markdown Sync is the official open-source TodoFlowy plugin for editing the current personal week as
portable Markdown. It provides a runtime, task view, toolbar action, and settings section through the
public TodoFlowy Contracts and SDK only.

## Markdown Contract

Canonical lines use a checkbox plus a trailing text metadata comment:

```markdown
- [ ] Write report <!-- todoflowy:v1 id=00000000-0000-4000-8000-000000000001 rev=7 status=todo -->
```

The metadata preserves exact Todo identity, revision, and preview status. A metadata-free line may match only one exact current-week title; duplicates are ambiguous. Omitting a Todo from Markdown never deletes it. The editor accepts at most 500 checkbox lines and 192 KiB of UTF-8 text.

## Hidden Metadata And Obsidian

The task editor hides valid TodoFlowy metadata by default while keeping the complete Markdown in the draft and synchronization pipeline. Use **Show sync info** to inspect the raw comments. Copying while metadata is hidden produces clean Markdown; copying while it is shown preserves the comments.

For an exact Obsidian round trip, show the sync information before copying, keep each trailing comment when editing in Obsidian, and paste the complete Markdown back before Preview and Apply. Obsidian does not render HTML comments as task text in Reading view, though they may be visible in source-oriented editing modes. Removing the comments falls back to unique-title matching, so renamed or duplicate-title tasks can no longer be matched reliably.

## Lifecycle And Writes

- The task view reads pages of 25 Todos, preserves a dirty draft byte for byte, previews a deterministic plan, asks for host confirmation, and is the only entry with `todos:write`.
- Apply re-reads the current snapshot and recomputes the fingerprint before the first write. Actions run serially in source-line order with returned revisions and no automatic retries.
- Definite failures are reported and later independent lines continue. Timeout, disposed, or unexpected internal outcomes are `uncertain` and stop further writes.
- Every apply attempt refreshes the editor from authoritative TodoFlowy-visible state. The toolbar runtime never writes Todos; the settings view has no `todos:read` capability.
- Theme, locale, Todo events, remount, account switch, disable, and shutdown use the existing SDK and host lifecycle. Plugin storage contains only versioned `settings` and `draft` records.

## Build And Verify

`runtime.js`, `task-view.js`, and `settings.js` are separate self-contained ES2022 ESM bundles built with Vite 8 and code splitting disabled. Toolkit packaging includes only `manifest.json` and those declared entries, validates the package, and produces byte-identical ZIPs for identical inputs.

```bash
corepack pnpm prepare:platform
corepack pnpm install --frozen-lockfile
corepack pnpm verify
```

The current pre-release build profile uses five exact `0.1.0-rc.0` TodoFlowy platform tarballs.
Their filenames, sizes, and SHA-256 digests are pinned in `platform-rc.json`; the tarball bytes are
intentionally not committed or made public by this repository. `prepare:platform` downloads them
through the locally authenticated GitHub CLI and verifies every digest. This temporary authenticated
handoff will be replaced with public immutable package coordinates before production Marketplace
release.

## Boundaries

The plugin has no filesystem, network, Clipboard, Tauri, React, host-private Repository, authentication, account identity, or background-watch access. Epic 7 adds no public contract, capability, Runtime/SDK behavior, Tauri command, CSP rule, or account key, so there is no public Changeset or version decision for this implementation.

TodoFlowy 0.3.2 macOS integration is the current compatibility target. Windows WebView2, Linux
WebKitGTK, a second released TodoFlowy version, independent security review, production package
coordinates, Registry promotion, and public Marketplace enablement remain separate gates.

## License

Markdown Sync source is licensed under the MIT License. See `LICENSE`.
