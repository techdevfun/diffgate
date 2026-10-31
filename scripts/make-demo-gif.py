#!/usr/bin/env python3
"""Build examples/demo.gif + examples/demo-transcript.txt from REAL diffgate runs.

Every command's output is captured verbatim from the built CLI (dist/cli.js)
running against a synthetic repo with base/pr/fixed branches. Nothing is
invented or reworded: the script only adds a typing animation, hold frames,
and an (exit code N) note for failing commands.
"""

import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLI = os.path.join(ROOT, "dist", "cli.js")
SAMPLE = os.path.join(ROOT, "examples", "sample-diff")
OUT_GIF = os.path.join(ROOT, "examples", "demo.gif")
OUT_TXT = os.path.join(ROOT, "examples", "demo-transcript.txt")

BG = (30, 30, 30)
FG = (212, 212, 212)
PROMPT = (126, 231, 135)
CMD = (255, 255, 255)
DIM = (150, 150, 150)

FPS = 12
FONT_SIZE = 18
LINE_H = 24
PAD = 16


def sh(cmd, cwd, env):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, env=env)
    return r.returncode, r.stdout, r.stderr


def build_demo_repo(tmp):
    bindir = os.path.join(tmp, "bin")
    os.makedirs(bindir)
    with open(os.path.join(bindir, "diffgate"), "w") as f:
        f.write('#!/bin/sh\nexec node "%s" "$@"\n' % CLI)
    os.chmod(os.path.join(bindir, "diffgate"), 0o755)
    env = dict(os.environ)
    env["PATH"] = bindir + os.pathsep + env["PATH"]

    repo = os.path.join(tmp, "repo")
    os.makedirs(repo)
    sh(["git", "init", "-q"], repo, env)
    sh(["git", "config", "user.email", "demo@diffgate.dev"], repo, env)
    sh(["git", "config", "user.name", "diffgate demo"], repo, env)
    shutil.copytree(os.path.join(SAMPLE, "base"), repo, dirs_exist_ok=True)
    sh(["git", "add", "-A"], repo, env)
    sh(["git", "commit", "-qm", "base"], repo, env)
    base = sh(["git", "rev-parse", "HEAD"], repo, env)[1].strip()

    sh(["git", "checkout", "-qb", "pr"], repo, env)
    shutil.copytree(os.path.join(SAMPLE, "head"), repo, dirs_exist_ok=True)
    sh(["git", "add", "-A"], repo, env)
    sh(["git", "commit", "-qm", "pr with violations"], repo, env)

    sh(["git", "checkout", "-qb", "fixed", base], repo, env)
    shutil.copytree(os.path.join(SAMPLE, "fixed"), repo, dirs_exist_ok=True)
    # fixed keeps the small base routes.json; the split files are the fix
    sh(["git", "add", "-A"], repo, env)
    sh(["git", "commit", "-qm", "fix the violations"], repo, env)
    return repo, env, base


def main():
    if not os.path.exists(CLI):
        sys.exit("build first: npm run build (dist/cli.js missing)")
    tmp = tempfile.mkdtemp(prefix="diffgate-demo-")
    try:
        repo, env, base = build_demo_repo(tmp)
        script = [
            ("diffgate --version", 14),
            ("git checkout -q pr", 8),
            ("diffgate check --base " + base[:12], 64),
            ("diffgate check --base " + base[:12] + " --format github", 34),
            ("git checkout -q fixed", 8),
            ("diffgate check --base " + base[:12], 34),
        ]
        # NOTE: the transcript shows the full sha; the GIF uses the short
        # form only for the typed command -- output itself is verbatim.
        transcript_cmds = [c.replace(base[:12], base) for c, _ in script]

        font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", FONT_SIZE
        )
        probe = Image.new("RGB", (8, 8))
        d0 = ImageDraw.Draw(probe)
        char_w = d0.textlength("0123456789" * 10, font=font) / 100

        # capture all outputs first (verbatim)
        steps = []
        for (cmd, hold), tcmd in zip(script, transcript_cmds):
            real_cmd = tcmd  # run with the full sha
            code, out, err = sh(real_cmd.split(), repo, env)
            text = out + err
            steps.append((cmd, tcmd, code, text, hold))

        # transcript (exact)
        with open(OUT_TXT, "w") as f:
            for _, tcmd, code, text, _ in steps:
                f.write("$ " + tcmd + "\n")
                f.write(text)
                if not text.endswith("\n"):
                    f.write("\n")
                if code != 0:
                    f.write("(exit code %d)\n" % code)

        # lay out lines for width measurement: (text, is_cmd)
        lines = []
        for cmd, _, code, text, _ in steps:
            lines.append(("$ " + cmd, True))
            for ln in text.split("\n"):
                if ln == "" and text.endswith("\n"):
                    continue
                lines.append((ln, False))

        max_len = max(len(t) for t, _ in lines)
        width = max(960, int(max_len * char_w) + PAD * 2)
        visible = 26
        height = visible * LINE_H + PAD * 2

        frames = []
        cur = []
        for (cmd, _, _code, text, hold) in steps:
            for n in range(1, len(cmd) + 1, 3):
                cur_typed = ("$ " + cmd[:n], True)
                frames.append(draw_frame(cur, cur_typed, width, height, font, char_w, visible))
            cur.append(("$ " + cmd, False))
            for _ in range(6):
                frames.append(draw_frame(cur, None, width, height, font, char_w, visible))
            out_lines = [ln for ln in text.split("\n") if not (ln == "" and text.endswith("\n"))]
            for ln in out_lines:
                cur.append((ln, False))
            frames.append(draw_frame(cur, None, width, height, font, char_w, visible))
            for _ in range(hold):
                frames.append(draw_frame(cur, None, width, height, font, char_w, visible))
        for _ in range(12):
            frames.append(draw_frame(cur, None, width, height, font, char_w, visible))

        frames[0].save(
            OUT_GIF,
            save_all=True,
            append_images=frames[1:],
            duration=int(1000 / FPS),
            loop=0,
        )
        size = os.path.getsize(OUT_GIF)
        print("wrote %s (%d frames, %d bytes)" % (OUT_GIF, len(frames), size))
        print("wrote %s" % OUT_TXT)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def draw_frame(done_lines, typing, width, height, font, char_w, visible):
    img = Image.new("RGB", (width, height), BG)
    d = ImageDraw.Draw(img)
    items = list(done_lines)
    if typing is not None:
        items.append(typing)
    start = max(0, len(items) - visible)
    y = PAD
    for text, is_typing in items[start:]:
        if text.startswith("$ "):
            d.text((PAD, y), "$ ", font=font, fill=PROMPT)
            d.text((PAD + 2 * char_w, y), text[2:], font=font, fill=CMD)
        else:
            d.text((PAD, y), text, font=font, fill=FG)
        y += LINE_H
    return img


if __name__ == "__main__":
    main()
