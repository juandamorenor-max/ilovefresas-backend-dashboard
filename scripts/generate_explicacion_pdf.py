# -*- coding: utf-8 -*-
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "explicacion-sistema-ilovefresas.pdf"

FONT_REGULAR = "ArialCustom"
FONT_BOLD = "ArialCustom-Bold"
pdfmetrics.registerFont(TTFont(FONT_REGULAR, "C:/Windows/Fonts/arial.ttf"))
pdfmetrics.registerFont(TTFont(FONT_BOLD, "C:/Windows/Fonts/arialbd.ttf"))

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverTitle",
    parent=styles["Title"],
    fontName=FONT_BOLD,
    fontSize=27,
    leading=32,
    alignment=1,
    textColor=colors.HexColor("#9b2442"),
    spaceAfter=18,
))
styles.add(ParagraphStyle(
    name="CoverSubtitle",
    parent=styles["Normal"],
    fontName=FONT_REGULAR,
    fontSize=13,
    leading=18,
    alignment=1,
    textColor=colors.HexColor("#4b5563"),
    spaceAfter=12,
))
styles.add(ParagraphStyle(
    name="SectionTitle",
    parent=styles["Heading2"],
    fontName=FONT_BOLD,
    fontSize=16,
    leading=20,
    textColor=colors.HexColor("#9b2442"),
    spaceBefore=14,
    spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="Body",
    parent=styles["BodyText"],
    fontName=FONT_REGULAR,
    fontSize=10.5,
    leading=15,
    textColor=colors.HexColor("#1f2937"),
    spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="IlfBullet",
    parent=styles["BodyText"],
    fontName=FONT_REGULAR,
    fontSize=10.5,
    leading=15,
    leftIndent=16,
    firstLineIndent=-10,
    textColor=colors.HexColor("#1f2937"),
    spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="Callout",
    parent=styles["BodyText"],
    fontName=FONT_BOLD,
    fontSize=11,
    leading=16,
    textColor=colors.HexColor("#7f1d1d"),
    backColor=colors.HexColor("#fff1f2"),
    borderColor=colors.HexColor("#fecdd3"),
    borderWidth=1,
    borderPadding=8,
    spaceBefore=8,
    spaceAfter=10,
))


def p(story, text):
    story.append(Paragraph(text, styles["Body"]))


def bullet(story, text):
    story.append(Paragraph(f"- {text}", styles["IlfBullet"]))


def section(story, title):
    story.append(Paragraph(title, styles["SectionTitle"]))


def page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont(FONT_REGULAR, 8)
    canvas.setFillColor(colors.HexColor("#6b7280"))
    canvas.drawString(0.72 * inch, 0.45 * inch, "I Love Fresas - Sistema inteligente de pedidos")
    canvas.drawRightString(7.75 * inch, 0.45 * inch, f"Página {doc.page}")
    canvas.restoreState()


def build_pdf():
    story = []
    story.append(Spacer(1, 1.15 * inch))
    story.append(Paragraph("Sistema inteligente de pedidos<br/>I Love Fresas", styles["CoverTitle"]))
    story.append(Paragraph("Explicación simple y técnica para presentación comercial", styles["CoverSubtitle"]))
    story.append(Spacer(1, 0.25 * inch))
    story.append(Paragraph(
        "Un asistente conversacional que toma pedidos por chat, interpreta lenguaje natural con IA y deja cada orden lista para revisión del operario.",
        styles["Callout"],
    ))
    story.append(Spacer(1, 0.55 * inch))

    summary = [
        ["Canales", "Telegram en beta. Preparado para WhatsApp Business."],
        ["IA", "OpenAI como intérprete principal del mensaje del cliente."],
        ["Backend", "Node.js + TypeScript + Express."],
        ["Dashboard", "HTML, CSS y JavaScript para el panel del operario."],
        ["Estado", "Beta funcional supervisada."],
    ]
    table = Table(summary, colWidths=[1.45 * inch, 4.75 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#ffe4ec")),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#7f1d1d")),
        ("FONTNAME", (0, 0), (0, -1), FONT_BOLD),
        ("FONTNAME", (1, 0), (1, -1), FONT_REGULAR),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#f3c4d3")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (1, 0), (1, -1), [colors.white, colors.HexColor("#fff7fa")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(table)
    story.append(PageBreak())

    section(story, "1. ¿Qué es el sistema?")
    p(story, "El sistema es una beta de un asistente inteligente para tomar pedidos por chat. La idea es que el cliente pueda escribir de forma natural, como lo haría en WhatsApp, y que el bot entienda el pedido, pida los datos faltantes y deje todo listo para que un operario lo revise antes de despachar.")
    p(story, "No reemplaza al equipo humano. Su función es reducir trabajo repetitivo, ordenar la información y disminuir errores en productos, toppings, dirección, pago y confirmación del pedido.")

    section(story, "2. ¿Cómo funciona el flujo?")
    for item in [
        "El cliente escribe al bot por Telegram. Más adelante el mismo flujo puede conectarse a WhatsApp Business.",
        "El mensaje llega al backend del sistema.",
        "OpenAI interpreta qué quiere decir el cliente: pedido, pregunta, cambio, topping, dirección, pago o conversación normal.",
        "El backend valida que lo interpretado exista en el catálogo real del negocio.",
        "Si falta información importante, el bot pregunta solo lo necesario.",
        "Cuando el pedido está completo, queda en revisión para el operario.",
        "El operario revisa el pedido en el dashboard, confirma domicilio y envía el total final al cliente.",
    ]:
        bullet(story, item)

    section(story, "3. ¿Qué hace la IA?")
    p(story, "La IA se encarga de entender lenguaje natural. Esto es importante porque los clientes no escriben como formulario: escriben con errores, abreviaciones, mensajes partidos, cambios de opinión o preguntas mezcladas con el pedido.")
    for item in [
        "Identifica productos y cantidades.",
        "Reconoce toppings, adiciones, sabores y opciones obligatorias.",
        "Diferencia una pregunta de catálogo de un pedido real.",
        "Entiende cambios como “mejor cámbialo”, “agrégale Oreo” o “lo quiero para recoger”.",
        "Responde con tono amable y vendedor, sin sonar como robot.",
    ]:
        bullet(story, item)

    section(story, "4. ¿Qué valida el backend?")
    p(story, "El backend es la capa de seguridad operativa. Aunque la IA entienda el mensaje, el sistema valida que no se venda algo incorrecto.")
    for item in [
        "Producto existe en el menú.",
        "Producto está disponible y no agotado.",
        "Precio viene del catálogo, no del cliente.",
        "Topping o adición existe.",
        "Método de pago está activo.",
        "No se confirma un pedido con datos críticos faltantes.",
        "No se inventa domicilio ni promociones.",
    ]:
        bullet(story, item)

    story.append(Paragraph("Principio clave: la IA interpreta; el backend valida; el operario confirma.", styles["Callout"]))

    section(story, "5. Tecnologías usadas")
    tech = [
        ["Área", "Tecnología", "Uso"],
        ["Backend", "Node.js + TypeScript", "Servidor principal y lógica del sistema."],
        ["API", "Express", "Rutas para bot, dashboard y administración."],
        ["IA", "OpenAI", "Interpretación de mensajes y respuestas conversacionales."],
        ["Bot", "Telegram Bot API", "Canal actual de pruebas."],
        ["Futuro canal", "WhatsApp Business API", "Canal objetivo para operación real."],
        ["Dashboard", "HTML + CSS + JavaScript", "Panel del operario y configuración."],
        ["Datos beta", "Memoria local", "Datos temporales mientras se prueba."],
    ]
    tech_table = Table(tech, colWidths=[1.25 * inch, 1.65 * inch, 3.3 * inch], repeatRows=1)
    tech_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#9b2442")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
        ("FONTNAME", (0, 1), (-1, -1), FONT_REGULAR),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fff7fa")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(tech_table)
    story.append(PageBreak())

    section(story, "6. ¿Qué hace el dashboard?")
    p(story, "El dashboard es la herramienta del operario. Permite revisar pedidos antes de despachar y controlar elementos operativos del negocio.")
    for item in [
        "Ver pedidos entrantes y su estado.",
        "Revisar productos, cantidades, adiciones, dirección, pago y observaciones.",
        "Confirmar valor de domicilio y total final.",
        "Enviar confirmación al cliente.",
        "Marcar pedido como confirmado, preparando, despachado o completado.",
        "Pausar el bot en un chat cuando el operario interviene.",
        "Activar o apagar productos y toppings.",
        "Editar horarios y métodos de pago.",
        "Usar modo claro u oscuro.",
    ]:
        bullet(story, item)

    section(story, "7. ¿Qué puede hacer el bot hoy?")
    for item in [
        "Tomar pedidos por Telegram.",
        "Enviar el menú cuando el cliente lo pide.",
        "Usar el menú real del negocio.",
        "Preguntar aclaraciones cuando el cliente no especifica algo importante.",
        "Reconocer productos agotados como agotados, no como inexistentes.",
        "Pedir nombre, dirección, referencia y método de pago.",
        "Dejar el pedido listo para revisión.",
        "Avisar que un asesor confirmará domicilio y total antes de despachar.",
    ]:
        bullet(story, item)

    section(story, "8. Ejemplo simple")
    for line in [
        "<b>Cliente:</b> Hola, quiero unas fresas con helado y chips de chocolate.",
        "<b>Bot:</b> Claro. ¿Qué sabor de helado quieres?",
        "<b>Cliente:</b> Vainilla. Es para domicilio, pago Nequi.",
        "<b>Bot:</b> Listo. Para dejar tu pedido listo para revisión, regálame tu nombre y dirección completa con referencia.",
        "<b>Cliente:</b> Juan Moreno, Cra 39A #41-99, casa.",
        "<b>Bot:</b> Tu pedido quedó listo para revisión. En un momento un asesor te confirma el domicilio y el total final antes de despachar.",
    ]:
        p(story, line)

    section(story, "9. Estado actual")
    for item in [
        "Beta funcional corriendo localmente.",
        "Bot de Telegram activo para pruebas.",
        "Dashboard operativo conectado al backend.",
        "Catálogo editable desde el panel.",
        "Disponibilidad de productos configurable.",
        "Horarios y métodos de pago editables.",
        "WhatsApp Business aún no está conectado, pero la arquitectura está pensada para integrarlo.",
    ]:
        bullet(story, item)

    section(story, "10. Próximos pasos recomendados")
    for item in [
        "Probar con pedidos reales supervisados.",
        "Registrar errores reales de clientes y operarios.",
        "Conectar una base de datos para persistencia real.",
        "Definir tarifas de domicilio manualmente.",
        "Conectar WhatsApp Business oficialmente.",
        "Pulir diseño y operación del dashboard según feedback del restaurante.",
    ]:
        bullet(story, item)

    story.append(Paragraph("Resumen para presentar: es una herramienta de automatización supervisada. Atiende al cliente, organiza el pedido y deja al operario con el control final.", styles["Callout"]))

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=letter,
        rightMargin=0.72 * inch,
        leftMargin=0.72 * inch,
        topMargin=0.72 * inch,
        bottomMargin=0.72 * inch,
        title="Explicación del sistema I Love Fresas",
        author="Codex",
    )
    doc.build(story, onFirstPage=page_number, onLaterPages=page_number)


if __name__ == "__main__":
    OUT.parent.mkdir(exist_ok=True)
    build_pdf()
    print(OUT)
