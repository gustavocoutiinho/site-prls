#!/usr/bin/env python3
"""Compila o template do PRLS OS num index.html.

As fontes do KV NÃO são mais embutidas em base64 (isso inflava o index.html pra ~653KB,
impedia o cache do navegador e obrigava a baixar tudo até só pra ver a tela de login).
Agora elas ficam como arquivos estáticos em ../fonts/*.woff2 (cacheados 1 ano via vercel.json)
e o compile só injeta os @font-face apontando por URL. index.html cai pra ~234KB.

Uso normal (zero dependência):   cd _src && python3 compile.py   -> gera ../index.html
Regerar os .woff2 (só ao trocar as fontes, exige fontTools):  python3 compile.py --fonts
Depois: cd .. && vercel deploy --prod --yes
"""
import pathlib, sys

HERE = pathlib.Path(__file__).parent
FONTS_SRC = HERE / "fonts"          # .otf originais = fonte da verdade
FONTS_OUT = HERE.parent / "fonts"   # .woff2 servidos estáticos (cacheados 1 ano)
OUT = HERE.parent / "index.html"

# (family, weight, arquivo .otf de origem, arquivo .woff2 servido)
FONTS = [
    ("Visby", 300, "visby-light.otf",    "visby-light.woff2"),
    ("Visby", 400, "visby-regular.otf",  "visby-regular.woff2"),
    ("Visby", 500, "orig-medium.otf",    "visby-medium.woff2"),
    ("Visby", 600, "orig-demibold.otf",  "visby-demibold.woff2"),
    ("Visby", 800, "orig-extrabold.otf", "visby-extrabold.woff2"),
    ("BTN",   700, "orig-btn.otf",       "btn-bold.woff2"),
]


def build_woff2():
    """Converte os .otf de _src/fonts/ em .woff2 em ../fonts/. Exige fontTools + brotli."""
    from fontTools.ttLib import TTFont
    FONTS_OUT.mkdir(exist_ok=True)
    for _, _, otf, woff2 in FONTS:
        f = TTFont(FONTS_SRC / otf)
        f.flavor = "woff2"
        f.save(FONTS_OUT / woff2)
        print(f"  {otf} -> fonts/{woff2} ({(FONTS_OUT/woff2).stat().st_size//1024}KB)")


def face(family, weight, woff2):
    return (f"@font-face{{font-family:'{family}';font-weight:{weight};font-style:normal;"
            f"font-display:swap;src:url(/fonts/{woff2}) format('woff2')}}")


if "--fonts" in sys.argv:
    build_woff2()

# gera os .woff2 automaticamente se algum estiver faltando (1ª vez / após trocar fontes)
if not all((FONTS_OUT / w).exists() for *_, w in FONTS):
    print("woff2 ausente(s), gerando a partir dos .otf...")
    build_woff2()

faces = [face(fam, wt, woff2) for fam, wt, _, woff2 in FONTS]
tpl = (HERE / "prls-os.template.html").read_text()
tpl = tpl.replace("/*FONTFACES*/", "\n".join(faces))
# injeta a estrutura + dados reais da DRE (gerados a partir dos xlsx do Gustavo, ver dre-embed.js)
dre = (HERE / "dre-embed.js").read_text()
tpl = tpl.replace("/*DREDATA*/", dre)
# A tela Análise NÃO tem mais dado embutido: desde 31/08/2026 ela recalcula o trimestre ao vivo
# (Bling + DRE lançada no portal). O antigo analise-embed.js (xlsx Set-Nov/25) fica só como histórico.
assert "%%" not in tpl, "sobrou token nao substituido"
OUT.write_text(tpl)
print(f"OK -> {OUT} ({OUT.stat().st_size//1024} KB) · fontes por URL em /fonts/*.woff2 (cache 1 ano)")
