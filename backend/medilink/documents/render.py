"""PDF rendering for generated documents (contract sprint-07 §1, decision D-8).

reportlab draws the page from a plain content dict: no HTML, no templates that fetch, no network
access at all, so a crafted value can only ever print as text. The QR code is reportlab's own
widget and points at the public verification page. Output is deterministic for the same content
(fixed creation date and document id), so the stored SHA-256 can be checked again later.
"""

from __future__ import annotations

import io
from typing import Any
from xml.sax.saxutils import escape

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

INK = colors.HexColor("#14211d")
MUTED = colors.HexColor("#5b6b66")
RULE = colors.HexColor("#c9d3cf")
BRAND = colors.HexColor("#0f6b57")

LABELS: dict[str, dict[str, str]] = {
    "en": {
        "patient": "Patient",
        "born": "Born",
        "number": "Number",
        "date": "Date",
        "valid_until": "Valid until",
        "signed_by": "Signed by",
        "licence": "Licence",
        "verify": "Check this document at {url} with the code {code}.",
        "version": "Version {n}. Earlier printouts of this document are out of date.",
        "prescription": "Prescription",
        "referral": "Referral letter",
        "lab_request": "Lab or imaging request",
        "sick_note": "Sick note",
    },
    "fr": {
        "patient": "Patient",
        "born": "Né(e) le",
        "number": "Numéro",
        "date": "Date",
        "valid_until": "Valable jusqu'au",
        "signed_by": "Signé par",
        "licence": "Licence",
        "verify": "Vérifiez ce document sur {url} avec le code {code}.",
        "version": "Version {n}. Les impressions précédentes de ce document ne sont plus à jour.",
        "prescription": "Ordonnance",
        "referral": "Lettre de référence",
        "lab_request": "Demande d'analyses ou d'imagerie",
        "sick_note": "Certificat d'arrêt maladie",
    },
    "rw": {
        "patient": "Umurwayi",
        "born": "Yavutse",
        "number": "Nimero",
        "date": "Itariki",
        "valid_until": "Igihe izamara",
        "signed_by": "Byasinywe na",
        "licence": "Uruhushya",
        "verify": "Genzura iyi nyandiko kuri {url} ukoresheje kode {code}.",
        "version": "Verisiyo ya {n}. Izacapwe mbere ntizikigezweho.",
        "prescription": "Resept",
        "referral": "Urwandiko rwohereza umurwayi",
        "lab_request": "Gusaba ibizamini",
        "sick_note": "Icyemezo cy'uburwayi",
    },
}


def label(language: str, key: str, **values: Any) -> str:
    text = LABELS.get(language, LABELS["en"]).get(key) or LABELS["en"][key]
    return text.format(**values) if values else text


class _Qr(Flowable):
    def __init__(self, value: str, size: float) -> None:
        super().__init__()
        self.value, self.size = value, size
        self.width = self.height = size

    def draw(self) -> None:
        widget = QrCodeWidget(self.value, barLevel="M")
        x0, y0, x1, y1 = widget.getBounds()
        drawing = Drawing(
            self.size,
            self.size,
            transform=[self.size / (x1 - x0), 0, 0, self.size / (y1 - y0), 0, 0],
        )
        drawing.add(widget)
        renderPDF.draw(drawing, self.canv, 0, 0)


def _p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(text).replace("\n", "<br/>"), style)


def render_pdf(content: dict[str, Any]) -> bytes:
    """`content`: kind, language, title, number, date, valid_until, facility {name, address,
    phone}, patient {name, born}, sections [{heading, lines}], author {name, licence}, verify
    {code, url, link}, version_no."""
    lang = content["language"]
    base = ParagraphStyle("base", fontName="Helvetica", fontSize=10.5, leading=14, textColor=INK)
    small = ParagraphStyle("small", parent=base, fontSize=8.5, leading=11, textColor=MUTED)
    letterhead = ParagraphStyle(
        "letterhead", parent=base, fontName="Helvetica-Bold", fontSize=15, leading=18
    )
    title = ParagraphStyle(
        "title", parent=base, fontName="Helvetica-Bold", fontSize=13, textColor=BRAND
    )
    heading = ParagraphStyle(
        "heading", parent=base, fontName="Helvetica-Bold", fontSize=10.5, spaceBefore=6
    )

    facility = content["facility"]
    contact = " · ".join(v for v in (facility.get("address"), facility.get("phone")) if v)
    story: list[Any] = [_p(facility["name"], letterhead)]
    if contact:
        story.append(_p(contact, small))
    story += [Spacer(1, 4 * mm), _p(content["title"], title), Spacer(1, 3 * mm)]

    facts = [
        (label(lang, "number"), content["number"]),
        (label(lang, "date"), content["date"]),
        (label(lang, "patient"), content["patient"]["name"]),
    ]
    if content["patient"].get("born"):
        facts.append((label(lang, "born"), content["patient"]["born"]))
    if content.get("valid_until"):
        facts.append((label(lang, "valid_until"), content["valid_until"]))
    table = Table(
        [[_p(k, small), _p(v, base)] for k, v in facts],
        colWidths=[34 * mm, 136 * mm],
        hAlign="LEFT",
    )
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, -1), (-1, -1), 0.5, RULE),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story += [table, Spacer(1, 4 * mm)]

    for section in content["sections"]:
        if section.get("heading"):
            story.append(_p(section["heading"], heading))
        for line in section["lines"]:
            story.append(_p(line, base))
    author = content["author"]
    signed = label(lang, "signed_by") + " " + author["name"]
    if author.get("licence"):
        signed += f" · {label(lang, 'licence')} {author['licence']}"
    story += [Spacer(1, 8 * mm), _p(signed, base), Spacer(1, 6 * mm)]

    verify = content["verify"]
    note = label(lang, "verify", url=verify["url"], code=verify["code"])
    if content.get("version_no", 1) > 1:
        note += " " + label(lang, "version", n=content["version_no"])
    footer = Table(
        [[_Qr(verify["link"], 26 * mm), _p(note, small)]],
        colWidths=[32 * mm, 138 * mm],
        hAlign="LEFT",
    )
    footer.setStyle(
        TableStyle(
            [("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEABOVE", (0, 0), (-1, 0), 0.5, RULE)]
        )
    )
    story.append(footer)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=content["title"],
        author=facility["name"],
        creator="MediLink",
        invariant=1,  # fixed dates and ids: the same content gives the same bytes
    )
    doc.build(story)
    return buffer.getvalue()
