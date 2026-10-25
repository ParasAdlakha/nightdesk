"""Builds the narrated demo and pitch videos from slide and dashboard images.
Narration: Windows built-in speech (System.Speech). Assembly: ffmpeg.
Usage: python scripts/make_video.py"""
import subprocess, json, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMG, SLIDES, OUT = ROOT / "docs" / "img", ROOT / "docs" / "slides", ROOT / "docs" / "video"

DEMO = [
    (SLIDES / "s1.png", "This is Nightdesk: an always-on support agent that works the night shift, on your own hardware, with every model call running locally."),
    (IMG / "dashboard-empty.png", "Here is the dashboard. The chips at the top show the model running on localhost, zero cloud model calls, and an inference cost of zero. The agent checks the inbox every ten seconds, around the clock."),
    (IMG / "dashboard-working.png", "Six emails arrive overnight. The agent picks them up one at a time. For each one, the local model decides which tools to call: look up the customer, classify, search the knowledge base, draft a reply, and escalate only if it must."),
    (IMG / "dashboard-escalated.png", "At two in the morning, Harbor Logistics reports their warehouse scanners are down. The agent finds they are an enterprise customer with a one hour SLA, classifies it as P one, pages the on-call channel, and drafts a holding reply from the outage policy. The trace shows every tool call the model chose."),
    (IMG / "dashboard-draft.png", "A double charge gets a reply grounded in the billing policy, plus a task for billing to confirm before any refund is promised. The agent cannot send email. A person approves every reply."),
    (IMG / "dashboard-brief.png", "At eight in the morning, the brief lands in Telegram or Slack: what came in, what was escalated, which revenue is at risk, and who owns each follow-up. The spam was archived, and nobody was woken for it."),
    (SLIDES / "s6.png", "Local first is enforced in code. The model endpoint must be localhost or the call is refused, and if the model is down, a rule engine runs the same tools. On a Dell Pro Max with G B ten, it runs all night. That's Nightdesk."),
]

PITCH = [
    (SLIDES / "s1.png", "Hi, we're Paras and Harshita, and this is Nightdesk: the support agent that works the night shift, on your own hardware."),
    (SLIDES / "s2.png", "B2B software runs twenty four seven, but support teams work nine to five. The urgent email arrives at two A M and waits under newsletters. Enterprise SLAs promise a response within the hour. Churn signals hide in the inbox. And cloud AI help desks mean sending every customer email to someone else's model."),
    (SLIDES / "s3.png", "Nightdesk is an always-on agent that triages the inbox overnight and wakes a human only when it should."),
    (SLIDES / "s4.png", "A local model chooses from seven narrow tools. The code decides what each tool may do. Drafts are saved, never sent. Escalation is only allowed after a P one or churn risk classification. And every call goes to an audit log."),
    (IMG / "dashboard-escalated.png", "Here it is handling a production outage at an enterprise account: customer looked up, classified P one, on-call paged, and a holding reply drafted from the outage policy."),
    (SLIDES / "s5.png", "Across one night, six emails get six right responses, from paging on-call to quietly archiving spam."),
    (IMG / "dashboard-brief.png", "In the morning, the team gets a brief in Telegram or Slack, with revenue at risk and owners for every follow-up."),
    (SLIDES / "s6.png", "It is local first by construction. A non local model endpoint is refused in code, and that is unit tested. When the model ran out of memory on our laptop, the rule engine kept triaging."),
    (SLIDES / "s7.png", "Companies pay for SLA protection, saved revenue, mornings back, and a setup their compliance team can sign off on."),
    (SLIDES / "s8.png", "Next: approve drafts from Telegram, connect real mailboxes, and add local embeddings on the G B ten. Thank you."),
]


def speak(text, wav):
    ps = (
        "Add-Type -AssemblyName System.Speech;"
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;"
        "$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -match 'Zira|Aria|Jenny' } | Select-Object -First 1;"
        "if ($v) { $s.SelectVoice($v.VoiceInfo.Name) };"
        "$s.Rate = 1;"
        f"$s.SetOutputToWaveFile('{wav}');"
        f"$s.Speak({json.dumps(text)});"
        "$s.Dispose()"
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def build(segments, out_name):
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="nightdesk-video-"))
    parts = []
    for i, (img, text) in enumerate(segments):
        wav, mp4 = tmp / f"{i}.wav", tmp / f"{i}.mp4"
        speak(text, str(wav))
        d = duration(wav) + 0.6
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", str(img), "-i", str(wav),
            "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x11140F,format=yuv420p",
            "-t", f"{d:.2f}", "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-b:a", "160k", "-af", "apad", str(mp4),
        ], check=True)
        parts.append(mp4)
    lst = tmp / "list.txt"
    lst.write_text("".join(f"file '{p.as_posix()}'\n" for p in parts))
    out = OUT / out_name
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", "-movflags", "+faststart", str(out)], check=True)
    print(out_name, f"{duration(out):.1f}s")


if __name__ == "__main__":
    build(DEMO, "Nightdesk-demo-2min.mp4")
    build(PITCH, "Nightdesk-pitch-3min.mp4")
