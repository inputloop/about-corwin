<!--
SPDX-FileCopyrightText: 2026 Corwin Brust <corwin@bru.st> and Contributors
SPDX-License-Identifier: CC-BY-SA-4.0
-->
# The access card

A way to say, in words, what you can reach and what a deploy may do there. It replaces a table of
rows or a long list of preferences with one short file a person can write, read and check by eye.

Any person on shared hosting can write one for their own host. Copy
[access/aboutcorwin.card](access/aboutcorwin.card), change the words, and run

```sh
sh scripts/access-card deploy/access/yours.card
```

The reader checks the card and prints it back as sentences. If something is wrong it says the line
and what, and exits 1; `--check` does the same without printing the sentences.

## The format

One `key: value` per line. Blank lines and lines starting with `#` are ignored. Keys may not be
invented; these are all of them.

| Key | Said how | Notes |
|---|---|---|
| `card` | one line | what this card is for |
| `updated` | `YYYY-MM-DD` | when someone last checked it was true |
| `host` | a host name | `server.example.com` |
| `user` | an account name | the shell user on that host |
| `key-register` | a plain name | the name your key register or agent answers to; letters, digits, `.` `_` `-` |
| `web-root` | `~/folder` or `/path` | where the web server reads from |
| `staging-root` | `~/folder` or `/path` | where new copies are unpacked before anything goes live |
| `tools` | comma list | what the host already has (git, python3, rsync ...) |
| `may` | one line, repeat | something the deploy is allowed to do; at least one |
| `may-not` | one line, repeat | something it must never do; at least one |
| `note` | one line, repeat | optional |

Every line except `may`, `may-not` and `note` appears once.

## What never goes on a card

The card names a key register entry, never a key. The reader refuses a card whose lines look like a
private key, a public key, a drive letter path, a backslash, an `.ssh/` or `.keys` path, or an
`id_rsa` style file name. The host name and the user name are not secrets and may be written down.

## Why plain lines

A card is read by the person who owns the account, by whoever reviews a deploy, and by an agent
about to act. All three get the same words. `may` and `may-not` are the part to write most
carefully: they are the line between a deploy and a surprise. A card says what is allowed; it does
not enforce it. Enforcement is the key's own constraint and the scripts' refusals (a backup that
fails stops go-live), which the tests plant faults against.
