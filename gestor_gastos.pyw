import os, sqlite3, json, time, csv
from datetime import datetime
import urllib.request
from tkinter import filedialog
import customtkinter as ctk
import matplotlib
matplotlib.use("TkAgg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.figure import Figure
import matplotlib.ticker as mticker
import numpy as np

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
GASTOS_DIR  = os.path.join(BASE_DIR, "Gastos")
DB_PATH     = os.path.join(GASTOS_DIR, "finanzas.db")
CONFIG_PATH = os.path.join(GASTOS_DIR, "config.json")
os.makedirs(GASTOS_DIR, exist_ok=True)

# ─── Design System ────────────────────────────────────────────────
# Typography sizes
F_TITLE    = 28
F_SUBTITLE = 14
F_SECTION  = 15
F_BODY     = 13
F_CAPTION  = 11
F_MINI     = 10
F_NAV      = 13
F_GROUP    = 10
# Text colors (light, dark)
CLR_TEXT        = ("#1a1a2e", "#eaeaea")
CLR_TEXT_SEC    = ("#5a6672", "#8b95a1")
CLR_TEXT_MUTED  = ("#8b95a1", "#6b7580")
# Accent palette — refined vibrant colors
CLR_GREEN    = "#00d4aa"
CLR_RED      = "#ff4757"
CLR_AMBER    = "#ffa502"
CLR_BLUE     = "#0984e3"
CLR_PURPLE   = "#6c5ce7"
# Old compatible aliases (used in existing code)
GRN = "#00b894"; RED = "#e94560"; AMB = "#fdcb6e"; BLU = "#0984e3"
# Sidebar
SB_BG_DARK   = "#141422"
SB_BG_LIGHT  = "#e8e8f0"
SB_ACCENT    = "#0984e3"
SB_SEP       = ("gray78", "gray28")
# Form styling
INPUT_BORDER       = ("gray70", "gray35")
INPUT_BORDER_FOCUS = CLR_BLUE
BTN_PRIMARY_FG     = CLR_BLUE
BTN_PRIMARY_HOVER  = "#0773c4"
BTN_DANGER_FG      = "#e17055"
BTN_DANGER_HOVER   = "#c0392b"

# ─── Tooltip helper ───────────────────────────────────────────────
class ToolTip:
    """Lightweight hover tooltip for any widget."""
    def __init__(self, widget, text, delay=400):
        self.widget = widget
        self.text = text
        self.delay = delay
        self._tw = None
        self._id = None
        widget.bind("<Enter>", self._schedule)
        widget.bind("<Leave>", self._hide)

    def _schedule(self, event=None):
        self._id = self.widget.after(self.delay, self._show)

    def _show(self):
        if self._tw:
            return
        x = self.widget.winfo_rootx() + 20
        y = self.widget.winfo_rooty() + self.widget.winfo_height() + 5
        tw = self._tw = ctk.CTkToplevel(self.widget)
        tw.wm_overrideredirect(True)
        tw.wm_geometry(f"+{x}+{y}")
        tw.attributes("-topmost", True)
        lbl = ctk.CTkLabel(tw, text=self.text, corner_radius=8,
                           fg_color=("gray85","gray20"),
                           font=ctk.CTkFont(size=11), wraplength=280)
        lbl.pack(padx=1, pady=1)

    def _hide(self, event=None):
        if self._id:
            self.widget.after_cancel(self._id)
            self._id = None
        if self._tw:
            self._tw.destroy()
            self._tw = None

    def update_text(self, new_text):
        self.text = new_text

# ─── Color utilities ──────────────────────────────────────────────
def _lerp_color(c1, c2, t):
    """Interpolate between two hex colors. t in [0,1]."""
    r1, g1, b1 = int(c1[1:3],16), int(c1[3:5],16), int(c1[5:7],16)
    r2, g2, b2 = int(c2[1:3],16), int(c2[3:5],16), int(c2[5:7],16)
    r = int(r1 + (r2-r1)*t); g = int(g1 + (g2-g1)*t); b = int(b1 + (b2-b1)*t)
    return f"#{r:02x}{g:02x}{b:02x}"

def semaphore_color(pct):
    """Return a gradient color from green→yellow→red based on pct (0-100)."""
    if pct < 50:
        return _lerp_color("#00b894", "#fdcb6e", pct / 50)
    else:
        return _lerp_color("#fdcb6e", "#e94560", (pct - 50) / 50)

def get_conn(): return sqlite3.connect(DB_PATH)

def init_db():
    now = datetime.now()
    with get_conn() as c:
        c.executescript("""
            CREATE TABLE IF NOT EXISTS ingresos(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mes INTEGER NOT NULL, anio INTEGER NOT NULL,
                sueldo REAL DEFAULT 0, otros REAL DEFAULT 0,
                UNIQUE(mes, anio));
            CREATE TABLE IF NOT EXISTS gastos_fijos(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL, monto REAL NOT NULL, activo INTEGER DEFAULT 1,
                moneda TEXT DEFAULT 'ARS', mes INTEGER DEFAULT 0, anio INTEGER DEFAULT 0);
            CREATE TABLE IF NOT EXISTS gastos_mensuales(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mes INTEGER NOT NULL, anio INTEGER NOT NULL,
                nombre TEXT NOT NULL, monto REAL NOT NULL, categoria TEXT DEFAULT 'General',
                moneda TEXT DEFAULT 'ARS');
            CREATE TABLE IF NOT EXISTS cuotas(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL, monto_cuota REAL NOT NULL,
                cuota_actual INTEGER NOT NULL, total_cuotas INTEGER NOT NULL,
                mes_inicio INTEGER NOT NULL, anio_inicio INTEGER NOT NULL,
                activa INTEGER DEFAULT 1, moneda TEXT DEFAULT 'ARS',
                tarjeta_id INTEGER DEFAULT NULL);
            CREATE TABLE IF NOT EXISTS tarjetas(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'VISA',
                ultimos_4 TEXT DEFAULT '', activa INTEGER DEFAULT 1);
            CREATE TABLE IF NOT EXISTS historial_inflacion(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mes INTEGER NOT NULL, anio INTEGER NOT NULL,
                valor REAL NOT NULL,
                UNIQUE(mes, anio));
            CREATE TABLE IF NOT EXISTS metas_ahorro(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL, objetivo REAL NOT NULL,
                acumulado REAL DEFAULT 0, fecha_limite TEXT,
                prioridad INTEGER DEFAULT 50, activa INTEGER DEFAULT 1);
            CREATE TABLE IF NOT EXISTS aportes_ahorro(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meta_id INTEGER NOT NULL, monto REAL NOT NULL,
                fecha TEXT NOT NULL,
                FOREIGN KEY(meta_id) REFERENCES metas_ahorro(id));
            CREATE TABLE IF NOT EXISTS cuotas_pausadas(
                cuota_id INTEGER NOT NULL, mes INTEGER NOT NULL, anio INTEGER NOT NULL,
                PRIMARY KEY(cuota_id, mes, anio));
        """)
        # Migration: add moneda column to existing tables if missing
        for tbl in ('gastos_fijos', 'gastos_mensuales', 'cuotas'):
            cols = [r[1] for r in c.execute(f"PRAGMA table_info({tbl})").fetchall()]
            if 'moneda' not in cols:
                c.execute(f"ALTER TABLE {tbl} ADD COLUMN moneda TEXT DEFAULT 'ARS'")
        # Migration: add mes/anio to gastos_fijos if missing
        cols_fijos = [r[1] for r in c.execute("PRAGMA table_info(gastos_fijos)").fetchall()]
        if 'mes' not in cols_fijos:
            c.execute("ALTER TABLE gastos_fijos ADD COLUMN mes INTEGER DEFAULT 0")
            c.execute("ALTER TABLE gastos_fijos ADD COLUMN anio INTEGER DEFAULT 0")
        # Migrate existing records with mes=0 to current month
        c.execute(f"UPDATE gastos_fijos SET mes={now.month}, anio={now.year} WHERE mes=0 AND anio=0")
        # Migration: add tarjeta_id to cuotas if missing
        cols_cuotas = [r[1] for r in c.execute("PRAGMA table_info(cuotas)").fetchall()]
        if 'tarjeta_id' not in cols_cuotas:
            c.execute("ALTER TABLE cuotas ADD COLUMN tarjeta_id INTEGER DEFAULT NULL")

def get_dolar_oficial(cfg):
    """Fetch USD oficial sell rate with 1h cache."""
    cached = cfg.get("dolar_oficial_venta", 0)
    ts     = cfg.get("dolar_timestamp", 0)
    if cached and (time.time() - ts) < 3600:
        return cached
    try:
        req = urllib.request.Request("https://dolarapi.com/v1/dolares/oficial",
                                     headers={"User-Agent": "GestorGastos/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
        venta = data.get("venta", cached or 1)
        cfg["dolar_oficial_venta"] = venta
        cfg["dolar_timestamp"] = time.time()
        save_config(cfg)
        return venta
    except Exception:
        return cached or 1

def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH) as f:
                return {**{"theme":"dark"}, **json.load(f)}
        except Exception: pass
    return {"theme": "dark", "inflacion": 4.2}

def save_config(cfg):
    with open(CONFIG_PATH, "w") as f: json.dump(cfg, f, indent=2)

class App(ctk.CTk):
    MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
              "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]

    def __init__(self):
        super().__init__()
        self.cfg   = load_config()
        self.theme = self.cfg.get("theme","dark")
        ctk.set_appearance_mode(self.theme)
        ctk.set_default_color_theme("blue")
        self.title("Gestor de Gastos Personales")
        self.geometry("1300x820")
        self.minsize(1100, 700)
        self.protocol("WM_DELETE_WINDOW", self._close)
        now = datetime.now()
        self.sel_month = now.month
        self.sel_year  = now.year
        self._active   = "dashboard"
        self.dolar = get_dolar_oficial(self.cfg)
        self._cache = {}  # performance cache for resumen/queries
        init_db()
        self._build_ui()
        self._bind_shortcuts()
        self._nav("dashboard")

    def _bind_shortcuts(self):
        sections = ["dashboard","historial","ingresos","fijos","mensuales",
                    "cuotas","graficos","proyeccion","ahorro"]
        self.bind("<Control-d>", lambda e: self._nav("dashboard"))
        self.bind("<Escape>",    lambda e: self._nav("dashboard"))
        self.bind("<Control-t>", lambda e: self._toggle_theme())
        for i, sec in enumerate(sections):
            self.bind(f"<Control-Key-{i+1}>", lambda e, s=sec: self._nav(s))

    def _build_ui(self):
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)
        sb = ctk.CTkFrame(self, width=245, corner_radius=0,
                          fg_color=(SB_BG_LIGHT, SB_BG_DARK))
        sb.grid(row=0, column=0, sticky="nsew")
        sb.grid_propagate(False)
        # Branding
        self._sb_toggle_btn = ctk.CTkButton(sb, text="‹", width=26, height=22,
                      corner_radius=6, fg_color=("gray80","gray30"),
                      hover_color=("gray70","gray40"),
                      font=ctk.CTkFont(size=14, weight="bold"),
                      command=self._toggle_sidebar_compact)
        self._sb_toggle_btn.pack(anchor="e", padx=8, pady=(0,2))
        ctk.CTkLabel(sb, text="💼  Finanzas",
                     font=ctk.CTkFont(size=20, weight="bold"),
                     text_color=CLR_TEXT).pack(anchor="w", padx=15, pady=(15,0))
        ctk.CTkLabel(sb, text="Gestor Personal", font=ctk.CTkFont(size=11),
                     text_color=CLR_TEXT_MUTED).pack(anchor="w", padx=15, pady=(0,6))
        ctk.CTkFrame(sb, height=1, fg_color=SB_SEP).pack(fill="x", padx=12)
        # Period selector
        pf = ctk.CTkFrame(sb, corner_radius=8, fg_color=("gray90","#1c1c32"))
        pf.pack(fill="x", padx=8, pady=5)
        ctk.CTkLabel(pf, text="📅 Periodo", font=ctk.CTkFont(size=10),
                     text_color=CLR_TEXT_MUTED).pack(anchor="w", padx=10, pady=(5,2))
        self.mv = ctk.StringVar(value=self.MONTHS[self.sel_month-1])
        ctk.CTkComboBox(pf, values=self.MONTHS, variable=self.mv, width=200,
                        command=self._period_changed, height=26).pack(padx=10, pady=(0,2))
        self.yv = ctk.StringVar(value=str(self.sel_year))
        ctk.CTkComboBox(pf, values=[str(y) for y in range(2020,2031)],
                        variable=self.yv, width=200, command=self._period_changed,
                        height=26).pack(padx=10, pady=(0,5))
        ctk.CTkFrame(sb, height=1, fg_color=SB_SEP).pack(fill="x", padx=12, pady=2)
        # Navigation — simple buttons, no wrapper frames
        self.nav_btns = {}
        nav_sections = [
            ("RESUMEN", [("dashboard","📊 Dashboard"), ("historial","📋 Historial")]),
            ("INGRESOS & GASTOS", [("ingresos","💰 Ingresos"), ("fijos","📌 Gastos Fijos"),
                                    ("mensuales","🛒 Mensuales"), ("cuotas","💳 Cuotas")]),
            ("ANALISIS", [("graficos","📈 Graficos"), ("proyeccion","🔮 Proyeccion"),
                          ("ahorro","🏦 Ahorro")]),
        ]
        for group, items in nav_sections:
            ctk.CTkLabel(sb, text=group, font=ctk.CTkFont(size=9, weight="bold"),
                         text_color=CLR_TEXT_MUTED).pack(anchor="w", padx=15, pady=(6,1))
            for key, lbl in items:
                b = ctk.CTkButton(sb, text=lbl, anchor="w", fg_color="transparent",
                                  hover_color=("gray80","gray25"),
                                  font=ctk.CTkFont(size=12), height=28,
                                  text_color=CLR_TEXT,
                                  command=lambda k=key: self._nav(k))
                b.pack(fill="x", padx=8, pady=1)
                self.nav_btns[key] = b
        ctk.CTkFrame(sb, height=1, fg_color=SB_SEP).pack(fill="x", padx=12, pady=2)
        b_aj = ctk.CTkButton(sb, text="⚙️ Ajustes", anchor="w", fg_color="transparent",
                             hover_color=("gray80","gray25"),
                             font=ctk.CTkFont(size=12), height=28, text_color=CLR_TEXT,
                             command=lambda: self._nav("ajustes"))
        b_aj.pack(fill="x", padx=8, pady=1)
        self.nav_btns["ajustes"] = b_aj
        # Balance
        self._sb_balance_frame = ctk.CTkFrame(sb, fg_color="transparent")
        self._sb_balance_frame.pack(fill="x", padx=10, pady=(4,0))
        # Spacer
        ctk.CTkFrame(sb, fg_color="transparent").pack(fill="both", expand=True)
        # Theme toggle
        ctk.CTkFrame(sb, height=1, fg_color=SB_SEP).pack(fill="x", padx=12, pady=2)
        tf = ctk.CTkFrame(sb, fg_color="transparent")
        tf.pack(fill="x", padx=10, pady=(2,10))
        ctk.CTkLabel(tf, text="🌙 Oscuro", font=ctk.CTkFont(size=11),
                     text_color=CLR_TEXT).pack(side="left", padx=5)
        self.tsw = ctk.CTkSwitch(tf, text="", onvalue="dark", offvalue="light",
                                  command=self._toggle_theme)
        self.tsw.pack(side="right", padx=5)
        if self.theme == "dark": self.tsw.select()
        # Main area
        ma = ctk.CTkFrame(self, corner_radius=0, fg_color=("gray95","gray10"))
        ma.grid(row=0, column=1, sticky="nsew")
        ma.grid_columnconfigure(0, weight=1)
        ma.grid_rowconfigure(0, weight=1)
        self.cf = ctk.CTkScrollableFrame(ma, fg_color="transparent", scrollbar_fg_color=("gray95","gray10"), scrollbar_button_color=("gray95","gray10"), scrollbar_button_hover_color=("gray85","gray20"))
        self.cf.grid(row=0, column=0, sticky="nsew", padx=20, pady=20)
        self.cf.grid_columnconfigure(0, weight=1)

    def _toggle_sidebar_compact(self):
        self._sidebar_compact = not self._sidebar_compact
        compact = self._sidebar_compact
        self._sb.configure(width=52 if compact else 245)
        self._sb_toggle_btn.configure(text='›' if compact else '‹')
        for widget in self._sb.winfo_children():
            if widget is self._sb_toggle_btn: continue
            if compact: widget.pack_forget()
        if not compact: self._nav(self._active)

    def _nav(self, section):
        self._active = section
        self._cache.clear()
        for k, b in self.nav_btns.items():
            b.configure(fg_color=("gray75","gray28") if k==section else "transparent",
                        font=ctk.CTkFont(size=12, weight="bold" if k==section else "normal"))
        for w in self.cf.winfo_children(): w.destroy()
        self.update_idletasks()
        self._update_sidebar_balance()
        getattr(self, f"_page_{section}")()

    def _update_sidebar_balance(self):
        """Update the quick balance shown in the sidebar."""
        for w in self._sb_balance_frame.winfo_children(): w.destroy()
        try:
            ing, _, _, _, tot, bal = self._resumen()
            clr = "#00b894" if bal >= 0 else "#e17055"
            ctk.CTkLabel(self._sb_balance_frame, text=f"Balance: ${bal:,.0f}",
                         font=ctk.CTkFont(size=F_BODY, weight="bold"), text_color=clr).pack(anchor="w", padx=5)
            pct = min(tot / ing, 1.0) if ing > 0 else 0
            pb_clr = semaphore_color(pct * 100)
            pb = ctk.CTkProgressBar(self._sb_balance_frame, height=6, corner_radius=3,
                                     progress_color=pb_clr, width=200)
            pb.set(pct)
            pb.pack(anchor="w", padx=5, pady=(2,0))
        except Exception:
            pass

    def _period_changed(self, _=None):
        self.sel_month = self.MONTHS.index(self.mv.get()) + 1
        self.sel_year  = int(self.yv.get())
        self._cache.clear()
        self._nav(self._active)

    def _toggle_theme(self):
        self.theme = self.tsw.get()
        ctk.set_appearance_mode(self.theme)
        self.cfg["theme"] = self.theme
        save_config(self.cfg)
        self._nav(self._active)

    def _close(self):
        plt.close("all"); self.destroy()

    @staticmethod
    def _style_ax(ax, bg, tc):
        """Apply premium chart styling to a matplotlib axes."""
        ax.set_facecolor(bg)
        ax.grid(axis='y', color='gray', alpha=0.15, linestyle=':', linewidth=0.8)
        ax.set_axisbelow(True)
        for sp in ax.spines.values():
            sp.set_color('gray'); sp.set_alpha(0.3)
        ax.tick_params(colors=tc, labelsize=8)
        ax.yaxis.set_tick_params(labelcolor=tc, labelsize=8)

    def _title(self, text, subtitle=""):
        ctk.CTkLabel(self.cf, text=text, font=ctk.CTkFont(size=F_TITLE, weight="bold"),
                     text_color=CLR_TEXT).grid(
            row=0, column=0, sticky="w", pady=(0, 2 if subtitle else 15), columnspan=2)
        if subtitle:
            ctk.CTkLabel(self.cf, text=subtitle, font=ctk.CTkFont(size=F_SUBTITLE),
                         text_color=CLR_TEXT_MUTED).grid(row=1, column=0, sticky="w", pady=(0,10), padx=2, columnspan=2)

    def _card(self, parent, row, col, title, value, sub="", color="#e94560",
              icon="", trend=None, sparkline_data=None, tooltip=""):
        dark = ctk.get_appearance_mode().lower() == "dark"
        bg = "#1e1e2e" if dark else "#f5f5f5"
        f = ctk.CTkFrame(parent, corner_radius=12)
        f.grid(row=row, column=col, padx=8, pady=8, sticky="nsew")
        # Accent bar at top
        accent = ctk.CTkFrame(f, height=4, corner_radius=2, fg_color=color)
        accent.pack(fill="x", padx=12, pady=(10,0))
        # Header row with title and icon
        hf = ctk.CTkFrame(f, fg_color="transparent")
        hf.pack(fill="x", padx=15, pady=(8,2))
        ctk.CTkLabel(hf, text=title, font=ctk.CTkFont(size=12),
                     text_color="gray").pack(side="left")
        if icon:
            ctk.CTkLabel(hf, text=icon, font=ctk.CTkFont(size=16)).pack(side="right")
        # Value
        val_lbl = ctk.CTkLabel(f, text=value, font=ctk.CTkFont(size=26, weight="bold"),
                     text_color=color)
        val_lbl.pack(anchor="w", padx=15)
        if tooltip:
            ToolTip(val_lbl, tooltip)
        # Sparkline
        if sparkline_data and len(sparkline_data) >= 2:
            fig_s = Figure(figsize=(2.8, 0.55), facecolor=bg)
            fig_s.subplots_adjust(left=0, right=1, top=1, bottom=0)
            ax_s = fig_s.add_subplot(111)
            ax_s.set_facecolor(bg)
            xs = list(range(len(sparkline_data)))
            ax_s.plot(xs, sparkline_data, color=color, linewidth=1.8, solid_capstyle="round")
            ax_s.fill_between(xs, sparkline_data, alpha=0.15, color=color)
            ax_s.set_xlim(0, len(sparkline_data)-1)
            ax_s.axis("off")
            cv_s = FigureCanvasTkAgg(fig_s, master=f)
            cv_s.draw()
            cv_s.get_tk_widget().pack(fill="x", padx=12, pady=(2,0))
        # Sub with optional trend
        sf = ctk.CTkFrame(f, fg_color="transparent")
        sf.pack(fill="x", padx=15, pady=(0,12))
        sub_text = sub or " "
        if trend is not None:
            arrow = "▲" if trend >= 0 else "▼"
            trend_clr = "#00b894" if trend >= 0 else "#e17055"
            sub_text = f"{arrow} {abs(trend):.1f}% vs anterior"
            ctk.CTkLabel(sf, text=sub_text, font=ctk.CTkFont(size=11),
                         text_color=trend_clr).pack(side="left")
        else:
            ctk.CTkLabel(sf, text=sub_text, font=ctk.CTkFont(size=11),
                         text_color="gray").pack(side="left")

    def _toast(self, message, color="#00b894", duration=3000):
        """Show a toast notification with slide-in animation."""
        toast = ctk.CTkFrame(self, corner_radius=10, fg_color=color, height=45)
        toast.place(relx=0.5, rely=-0.05, anchor="n")
        tf = ctk.CTkFrame(toast, fg_color="transparent")
        tf.pack(padx=20, pady=10)
        icon = "✅" if color == "#00b894" else "⚠️" if color == "#fdcb6e" else "❌"
        ctk.CTkLabel(tf, text=f"{icon}  {message}",
                     font=ctk.CTkFont(size=13, weight="bold"),
                     text_color="white").pack(side="left")
        # Slide-in animation
        def slide(step=0):
            if step <= 10:
                y = -0.05 + 0.07 * (step / 10)
                toast.place_configure(rely=y)
                toast.after(15, lambda: slide(step + 1))
        slide()
        # Fade-out
        def fade_out(step=0):
            if step <= 10:
                y = 0.02 + 0.07 * (step / 10)
                toast.place_configure(rely=y - 0.07)
                toast.after(15, lambda: fade_out(step + 1))
            else:
                toast.destroy()
        toast.after(duration, fade_out)

    def _confirm_delete(self, name, delete_fn):
        """Show confirmation dialog before deleting."""
        d = ctk.CTkToplevel(self)
        d.title("Confirmar")
        d.geometry("360x160")
        d.resizable(False, False)
        d.grab_set()
        d.after(10, lambda: d.focus_force())
        ctk.CTkLabel(d, text="⚠️  ¿Eliminar registro?",
                     font=ctk.CTkFont(size=16, weight="bold")).pack(pady=(20,5))
        ctk.CTkLabel(d, text=name, font=ctk.CTkFont(size=12),
                     text_color="gray", wraplength=300).pack(pady=(0,15))
        bf = ctk.CTkFrame(d, fg_color="transparent")
        bf.pack(pady=5)
        ctk.CTkButton(bf, text="Cancelar", fg_color="gray40", width=120,
                      command=d.destroy).pack(side="left", padx=5)
        def do_delete():
            d.destroy()
            delete_fn()
        ctk.CTkButton(bf, text="Eliminar", fg_color=BTN_DANGER_FG,
                      hover_color=BTN_DANGER_HOVER, width=120,
                      command=do_delete).pack(side="left", padx=5)

    def _clonar_mes_anterior(self):
        """Clone expenses from the previous month to the current one."""
        prev_m = self.sel_month - 1 if self.sel_month > 1 else 12
        prev_y = self.sel_year if self.sel_month > 1 else self.sel_year - 1
        with get_conn() as c:
            existing = c.execute(
                "SELECT COUNT(*) FROM gastos_mensuales WHERE mes=? AND anio=?",
                (self.sel_month, self.sel_year)).fetchone()[0]
            if existing > 0:
                self._toast(f"Ya hay {existing} gastos en {self.MONTHS[self.sel_month-1]}. Se agregaran los del mes anterior.", "#fdcb6e")
            prev_rows = c.execute(
                "SELECT nombre, monto, categoria FROM gastos_mensuales WHERE mes=? AND anio=?",
                (prev_m, prev_y)).fetchall()
            if not prev_rows:
                self._toast(f"No hay gastos en {self.MONTHS[prev_m-1]} {prev_y} para clonar", "#e17055")
                return
            for nm, mt, cat in prev_rows:
                c.execute(
                    "INSERT INTO gastos_mensuales(mes,anio,nombre,monto,categoria) VALUES(?,?,?,?,?)",
                    (self.sel_month, self.sel_year, nm, mt, cat))
        self._toast(f"Se clonaron {len(prev_rows)} gastos de {self.MONTHS[prev_m-1]} {prev_y}")
        self._nav(self._active)

    def _ing(self):
        with get_conn() as c:
            r = c.execute("SELECT sueldo,otros FROM ingresos WHERE mes=? AND anio=?",
                          (self.sel_month, self.sel_year)).fetchone()
        return (r[0] or 0, r[1] or 0) if r else (0.0, 0.0)

    def _fijos(self):
        with get_conn() as c:
            return c.execute(
                "SELECT id,nombre,monto,moneda FROM gastos_fijos WHERE activo=1 AND mes=? AND anio=?",
                (self.sel_month, self.sel_year)).fetchall()

    def _mens(self):
        with get_conn() as c:
            return c.execute(
                "SELECT id,nombre,monto,categoria,moneda FROM gastos_mensuales WHERE mes=? AND anio=?",
                (self.sel_month, self.sel_year)).fetchall()

    def _cuotas(self):
        with get_conn() as c:
            return c.execute(
                "SELECT id,nombre,monto_cuota,cuota_actual,total_cuotas,mes_inicio,anio_inicio,moneda,tarjeta_id "
                "FROM cuotas WHERE activa=1").fetchall()

    def _get_paused_set(self, mo, yr):
        key = ('paused', mo, yr)
        if key not in self._cache:
            with get_conn() as c:
                self._cache[key] = set(
                    r[0] for r in c.execute(
                        "SELECT cuota_id FROM cuotas_pausadas WHERE mes=? AND anio=?",
                        (mo, yr)).fetchall())
        return self._cache[key]

    def _cuota_en_mes(self, mc, ca, tc, mi, yi, yr=None, mo=None, cuota_id=None):
        yr = yr or self.sel_year
        mo = mo or self.sel_month
        n  = ca + (yr - yi) * 12 + (mo - mi)
        if n < 1 or n > tc: return 0.0
        if cuota_id is not None and cuota_id in self._get_paused_set(mo, yr):
            return 0.0
        return mc

    def _pesificar(self, monto, moneda):
        """Convert amount to ARS if moneda is USD."""
        if moneda and moneda.upper() == 'USD':
            return monto * self.dolar
        return monto

    def _resumen(self):
        key = (self.sel_month, self.sel_year, 'resumen')
        if key in self._cache:
            return self._cache[key]
        s, o = self._ing(); ing = s + o
        fij  = sum(self._pesificar(r[2], r[3] if len(r) > 3 else 'ARS') for r in self._fijos())
        men  = sum(self._pesificar(r[2], r[4] if len(r) > 4 else 'ARS') for r in self._mens())
        cuo  = sum(self._pesificar(
                   self._cuota_en_mes(r[2],r[3],r[4],r[5],r[6], cuota_id=r[0]),
                   r[7] if len(r) > 7 else 'ARS') for r in self._cuotas())
        tot  = fij + men + cuo
        result = ing, fij, men, cuo, tot, ing - tot
        self._cache[key] = result
        return result

    def _resumen_for(self, mo, yr):
        with get_conn() as c:
            r = c.execute("SELECT sueldo,otros FROM ingresos WHERE mes=? AND anio=?", (mo, yr)).fetchone()
            ing = ((r[0] or 0) + (r[1] or 0)) if r else 0.0
            fij_rows = c.execute("SELECT monto,moneda FROM gastos_fijos WHERE activo=1 AND mes=? AND anio=?", (mo, yr)).fetchall()
            fij = sum(self._pesificar(x[0], x[1] if len(x) > 1 else 'ARS') for x in fij_rows)
            men_rows = c.execute("SELECT monto,moneda FROM gastos_mensuales WHERE mes=? AND anio=?", (mo, yr)).fetchall()
            men = sum(self._pesificar(x[0], x[1] if len(x) > 1 else 'ARS') for x in men_rows)
            cuotas = c.execute("SELECT monto_cuota,cuota_actual,total_cuotas,mes_inicio,anio_inicio,moneda FROM cuotas WHERE activa=1").fetchall()
        cuo = sum(self._pesificar(
                  self._cuota_en_mes(r[0],r[1],r[2],r[3],r[4],yr,mo),
                  r[5] if len(r) > 5 else 'ARS') for r in cuotas)
        tot = fij + men + cuo
        return ing, tot, ing - tot

    def _get_inflacion(self):
        with get_conn() as c:
            r = c.execute("SELECT valor FROM historial_inflacion WHERE mes=? AND anio=?",
                          (self.sel_month, self.sel_year)).fetchone()
        if r: return float(r[0])
        return float(self.cfg.get("inflacion", 4.2))

    def _get_inflacion_historial(self):
        """Returns all months with inflation data sorted ascending."""
        with get_conn() as c:
            return c.execute(
                "SELECT mes, anio, valor FROM historial_inflacion ORDER BY anio, mes").fetchall()

    def _proyeccion_data(self, horizon=13):
        """Returns N-month projection lists: (xlbls, ingresos_list, gastos_list)"""
        s, o  = self._ing()
        ing0  = s + o
        fij0  = sum(self._pesificar(r[2], r[3] if len(r) > 3 else 'ARS') for r in self._fijos())
        men0  = sum(self._pesificar(r[2], r[4] if len(r) > 4 else 'ARS') for r in self._mens())
        r_inf = self._get_inflacion() / 100.0
        cuotas = self._cuotas()
        short  = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
        xlbls, ing_vals, gasto_vals = [], [], []
        for off in range(horizon):
            yr = self.sel_year  + (self.sel_month + off - 1) // 12
            mo = (self.sel_month + off - 1) % 12 + 1
            xlbls.append(short[mo-1] + chr(10) + str(yr))
            fij_n = fij0 * ((1 + r_inf) ** off)
            men_n = men0 * ((1 + r_inf) ** off)
            cuo_n = sum(self._pesificar(
                        self._cuota_en_mes(c[2],c[3],c[4],c[5],c[6],yr,mo),
                        c[7] if len(c) > 7 else 'ARS') for c in cuotas)
            ing_vals.append(ing0)
            gasto_vals.append(fij_n + men_n + cuo_n)
        return xlbls, ing_vals, gasto_vals

    def _page_dashboard(self):
        self._title(f"Dashboard — {self.MONTHS[self.sel_month-1]} {self.sel_year}",
                    f"💱 Dolar Oficial: ${self.dolar:,.2f}")
        ing, fij, men, cuo, tot, bal = self._resumen()
        bc = "#00b894" if bal >= 0 else "#e17055"

        # Compute trend vs previous month
        prev_m = self.sel_month - 1 if self.sel_month > 1 else 12
        prev_y = self.sel_year if self.sel_month > 1 else self.sel_year - 1
        p_ing, p_tot, p_bal = self._resumen_for(prev_m, prev_y)
        trend_ing = ((ing - p_ing) / p_ing * 100) if p_ing > 0 else None
        trend_tot = ((tot - p_tot) / p_tot * 100) if p_tot > 0 else None
        trend_bal = ((bal - p_bal) / abs(p_bal) * 100) if p_bal != 0 else None

        # --- Sparkline data: collect last 6 months ---
        SH = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
        with get_conn() as c:
            rows = c.execute(
                "SELECT mes,anio FROM ingresos ORDER BY anio ASC, mes ASC").fetchall()
        meses_hist = list(dict.fromkeys(rows))[-5:]
        if (self.sel_month, self.sel_year) not in meses_hist:
            meses_hist.append((self.sel_month, self.sel_year))
        meses_hist = meses_hist[-6:]
        ing_v, tot_v, bal_v = [], [], []
        for mo, yr in meses_hist:
            ig, tt, bl = self._resumen_for(mo, yr)
            ing_v.append(ig); tot_v.append(tt); bal_v.append(bl)

        # --- Top action bar ---
        top_bar = ctk.CTkFrame(self.cf, fg_color="transparent")
        top_bar.grid(row=2, column=0, sticky="ew", pady=(0,10))
        ctk.CTkButton(top_bar, text="📋  Clonar mes pasado", fg_color=("gray80","gray25"),
                      hover_color=("gray70","gray30"), text_color=("gray20","gray90"),
                      font=ctk.CTkFont(size=12), width=180, height=32, corner_radius=8,
                      command=self._clonar_mes_anterior).pack(side="right")

        # --- Main 2-column layout ---
        main_layout = ctk.CTkFrame(self.cf, fg_color="transparent")
        main_layout.grid(row=3, column=0, sticky="nsew")
        main_layout.grid_columnconfigure(0, weight=7)
        main_layout.grid_columnconfigure(1, weight=3)

        # ==================== LEFT COLUMN ====================
        left_col = ctk.CTkFrame(main_layout, fg_color="transparent")
        left_col.grid(row=0, column=0, sticky="nsew", padx=(0,10))
        left_col.grid_columnconfigure(0, weight=1)

        # KPI Cards (3 main) with sparklines
        cf = ctk.CTkFrame(left_col, fg_color="transparent")
        cf.grid(row=0, column=0, sticky="ew", pady=(0,15))
        for i in range(3): cf.grid_columnconfigure(i, weight=1)
        self._card(cf, 0, 0, "Ingresos Totales",  f"${ing:,.0f}", icon="📈", color="#00b894",
                   trend=trend_ing, sparkline_data=ing_v,
                   tooltip=f"Suma de sueldo + otros ingresos\nSueldo: ${self._ing()[0]:,.0f}\nOtros: ${self._ing()[1]:,.0f}")
        self._card(cf, 0, 1, "Egresos Totales",   f"${tot:,.0f}", icon="📉", color="#e94560",
                   trend=trend_tot, sparkline_data=tot_v,
                   tooltip=f"Fijos: ${fij:,.0f}\nMensuales: ${men:,.0f}\nCuotas: ${cuo:,.0f}")
        self._card(cf, 0, 2, "Resto Libre",        f"${bal:,.0f}", icon="💰", color=bc,
                   trend=trend_bal, sparkline_data=bal_v,
                   tooltip=f"Ingresos - Egresos\n{'Felicitaciones, estás ahorrando!' if bal > 0 else '⚠️ Gastos superan ingresos'}")

        # --- Ingresos detail + Donut chart ---
        detail_row = ctk.CTkFrame(left_col, fg_color="transparent")
        detail_row.grid(row=1, column=0, sticky="ew", pady=(0,15))
        detail_row.grid_columnconfigure((0,1), weight=1)

        # Ingresos detail card
        s, o = self._ing()
        ic = ctk.CTkFrame(detail_row, corner_radius=12)
        ic.grid(row=0, column=0, sticky="nsew", padx=(0,8))
        ic_hdr = ctk.CTkFrame(ic, fg_color="transparent")
        ic_hdr.pack(fill="x", padx=15, pady=(15,8))
        ctk.CTkLabel(ic_hdr, text="💰  Ingresos", font=ctk.CTkFont(size=14, weight="bold")).pack(side="left")
        ctk.CTkLabel(ic_hdr, text=f"${ing:,.0f}", font=ctk.CTkFont(size=14, weight="bold"),
                     text_color="#00b894").pack(side="right")
        for label, val in [("Sueldo", s), ("Otros Ingresos", o)]:
            if val > 0:
                row_f = ctk.CTkFrame(ic, fg_color="transparent")
                row_f.pack(fill="x", padx=20, pady=3)
                ctk.CTkLabel(row_f, text=label, font=ctk.CTkFont(size=12),
                             text_color="gray").pack(side="left")
                ctk.CTkLabel(row_f, text=f"${val:,.0f}", font=ctk.CTkFont(size=12),
                             text_color="#00b894").pack(side="right")
        # Ratio de ahorro
        ratio_ahorro = ((ing - tot) / ing * 100) if ing > 0 else 0
        ra_clr = "#00b894" if ratio_ahorro >= 20 else "#fdcb6e" if ratio_ahorro >= 10 else "#e17055"
        ra_f = ctk.CTkFrame(ic, fg_color="transparent")
        ra_f.pack(fill="x", padx=20, pady=(8,3))
        ctk.CTkLabel(ra_f, text="Ratio de Ahorro", font=ctk.CTkFont(size=12),
                     text_color="gray").pack(side="left")
        ra_lbl = ctk.CTkLabel(ra_f, text=f"{ratio_ahorro:.1f}%",
                     font=ctk.CTkFont(size=14, weight="bold"), text_color=ra_clr)
        ra_lbl.pack(side="right")
        ToolTip(ra_lbl, f"{'🟢 Excelente (>20%)' if ratio_ahorro >= 20 else '🟡 Moderado (10-20%)' if ratio_ahorro >= 10 else '🔴 Bajo (<10%)'}\nIdeal: ahorrar al menos 20% de ingresos")
        ctk.CTkLabel(ic, text="").pack(pady=3)

        # Donut chart replacing gastos text list
        dark = ctk.get_appearance_mode().lower() == "dark"
        bg = "#1a1a2e" if dark else "#f0f0f0"
        tc = "#ffffff" if dark else "#1a1a2e"
        gc = ctk.CTkFrame(detail_row, corner_radius=12)
        gc.grid(row=0, column=1, sticky="nsew", padx=(8,0))
        gc_hdr = ctk.CTkFrame(gc, fg_color="transparent")
        gc_hdr.pack(fill="x", padx=15, pady=(15,2))
        ctk.CTkLabel(gc_hdr, text="🍩  Distribución Gastos", font=ctk.CTkFont(size=14, weight="bold")).pack(side="left")
        ctk.CTkLabel(gc_hdr, text=f"${tot:,.0f}", font=ctk.CTkFont(size=14, weight="bold"),
                     text_color="#e94560").pack(side="right")
        # Build donut data
        donut_data = []
        if fij > 0: donut_data.append(("Fijos", fij, "#e94560"))
        if men > 0: donut_data.append(("Mensuales", men, "#0984e3"))
        if cuo > 0: donut_data.append(("Cuotas", cuo, "#fdcb6e"))
        if donut_data:
            fig_d = Figure(figsize=(3.2, 2.4), facecolor=bg)
            fig_d.subplots_adjust(left=0.05, right=0.95, top=0.95, bottom=0.05)
            ax_d = fig_d.add_subplot(111)
            ax_d.set_facecolor(bg)
            sizes = [d[1] for d in donut_data]
            colors_d = [d[2] for d in donut_data]
            labels = [f"{d[0]}\n${d[1]:,.0f}" for d in donut_data]
            wedges, texts = ax_d.pie(
                sizes, labels=labels, colors=colors_d,
                startangle=90, pctdistance=0.75,
                wedgeprops=dict(width=0.4, edgecolor=bg),
                textprops=dict(color=tc, fontsize=8))
            # Center text
            ax_d.text(0, 0, f"${tot:,.0f}", ha='center', va='center',
                      fontsize=12, fontweight='bold', color=tc)
            cv_d = FigureCanvasTkAgg(fig_d, master=gc)
            cv_d.draw()
            cv_d.get_tk_widget().pack(padx=5, pady=(0,8), fill="both", expand=True)
        else:
            ctk.CTkLabel(gc, text="Sin gastos registrados",
                         text_color="gray", font=ctk.CTkFont(size=12)).pack(padx=20, pady=30)
            ctk.CTkLabel(gc, text="").pack(pady=3)

        # --- Top 5 gastos del mes ---
        fijos_list = self._fijos()
        mens_list = self._mens()
        gasto_items = []
        for r in fijos_list:
            m_ars = self._pesificar(r[2], r[3] if len(r) > 3 else 'ARS')
            lbl = r[1] + (" 🇺🇸" if (len(r) > 3 and r[3] == 'USD') else "")
            gasto_items.append((lbl, m_ars, "#6c5ce7"))
        for r in mens_list:
            m_ars = self._pesificar(r[2], r[4] if len(r) > 4 else 'ARS')
            lbl = r[1] + (" 🇺🇸" if (len(r) > 4 and r[4] == 'USD') else "")
            gasto_items.append((lbl, m_ars, "#0984e3"))
        cuotas_data = self._cuotas()
        for r in cuotas_data:
            c_val = self._cuota_en_mes(r[2],r[3],r[4],r[5],r[6])
            if c_val > 0:
                c_ars = self._pesificar(c_val, r[7] if len(r) > 7 else 'ARS')
                lbl = r[1] + (" 🇺🇸" if (len(r) > 7 and r[7] == 'USD') else "")
                gasto_items.append((lbl, c_ars, "#fdcb6e"))
        # Sort by amount descending
        gasto_items.sort(key=lambda x: x[1], reverse=True)
        if gasto_items:
            top5_f = ctk.CTkFrame(left_col, corner_radius=12)
            top5_f.grid(row=2, column=0, sticky="ew", pady=(0,15))
            top5_f.grid_columnconfigure(0, weight=1)
            ctk.CTkLabel(top5_f, text="🏆  Top 5 Gastos del Mes",
                         font=ctk.CTkFont(size=14, weight="bold")).pack(
                anchor="w", padx=15, pady=(12,8))
            max_val = gasto_items[0][1] if gasto_items else 1
            for gi, (g_label, g_val, g_clr) in enumerate(gasto_items[:5]):
                g_row = ctk.CTkFrame(top5_f, fg_color="transparent")
                g_row.pack(fill="x", padx=15, pady=3)
                g_row.grid_columnconfigure(1, weight=1)
                ctk.CTkLabel(g_row, text=f"{gi+1}.", font=ctk.CTkFont(size=12, weight="bold"),
                             text_color=g_clr, width=25).grid(row=0, column=0, sticky="w")
                ctk.CTkLabel(g_row, text=g_label, font=ctk.CTkFont(size=12),
                             anchor="w").grid(row=0, column=1, sticky="ew", padx=(5,10))
                # Mini progress bar showing relative size
                pct_of_max = g_val / max_val if max_val > 0 else 0
                bar_f = ctk.CTkFrame(g_row, fg_color="transparent", width=120)
                bar_f.grid(row=0, column=2, sticky="e", padx=(0,5))
                pb_g = ctk.CTkProgressBar(bar_f, height=8, corner_radius=4,
                                           progress_color=g_clr, width=80)
                pb_g.set(pct_of_max)
                pb_g.pack(side="left", padx=(0,8))
                pct_of_tot = (g_val / tot * 100) if tot > 0 else 0
                val_lbl = ctk.CTkLabel(g_row, text=f"${g_val:,.0f}",
                             font=ctk.CTkFont(size=12, weight="bold"), text_color=g_clr)
                val_lbl.grid(row=0, column=3, sticky="e")
                ToolTip(val_lbl, f"Representa el {pct_of_tot:.1f}% del total de egresos")
            ctk.CTkLabel(top5_f, text="").pack(pady=4)

        # --- Evolucion mensual: grafico + tabla ---
        mode = ctk.get_appearance_mode()
        lbls = [SH[mo-1] + chr(10) + str(yr)[-2:] for mo, yr in meses_hist]

        bf = ctk.CTkFrame(left_col, fg_color="transparent")
        bf.grid(row=3, column=0, sticky="ew", pady=(0,15))
        bf.grid_columnconfigure(0, weight=3)
        bf.grid_columnconfigure(1, weight=2)

        cf2 = ctk.CTkFrame(bf, corner_radius=12)
        cf2.grid(row=0, column=0, sticky="nsew", padx=(0,10))
        cf2.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(cf2, text="Evolucion Mensual",
                     font=ctk.CTkFont(size=14, weight="bold")).grid(
            row=0, column=0, padx=15, pady=(12,5), sticky="w")
        fig = Figure(figsize=(6, 3), facecolor=bg)
        ax = fig.add_subplot(111)
        self._style_ax(ax, bg, tc)
        x = np.arange(len(meses_hist)); w = 0.35
        ax.bar(x - w/2, ing_v, width=w, color="#00b894", alpha=0.85, label="Ingresos", zorder=2)
        ax.bar(x + w/2, tot_v, width=w, color="#e94560", alpha=0.85, label="Gastos", zorder=2)
        ax.set_xticks(x); ax.set_xticklabels(lbls, fontsize=8, color=tc)
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"${v:,.0f}"))
        ax.legend(facecolor=bg, labelcolor=tc, fontsize=8, framealpha=0.3)
        fig.tight_layout(pad=1.0)
        cv = FigureCanvasTkAgg(fig, master=cf2); cv.draw()
        cv.get_tk_widget().grid(row=1, column=0, padx=10, pady=(0,12), sticky="ew")

        tf = ctk.CTkFrame(bf, corner_radius=12)
        tf.grid(row=0, column=1, sticky="nsew")
        tf.grid_columnconfigure((0,1,2,3), weight=1)
        ctk.CTkLabel(tf, text="Resumen por Mes",
                     font=ctk.CTkFont(size=F_SUBTITLE, weight="bold"),
                     text_color=CLR_TEXT).grid(
            row=0, column=0, columnspan=4, padx=15, pady=(12,5), sticky="w")
        hdr_f = ctk.CTkFrame(tf, fg_color=("gray78","gray22"), corner_radius=4)
        hdr_f.grid(row=1, column=0, columnspan=4, padx=8, pady=(0,4), sticky="ew")
        for col, hdr in enumerate(["Mes","Ingresos","Gastos","Balance"]):
            ctk.CTkLabel(hdr_f, text=hdr, font=ctk.CTkFont(size=F_CAPTION, weight="bold"),
                         text_color=CLR_TEXT_MUTED).grid(row=0, column=col, padx=8, pady=5, sticky="w")
        for i, (mo, yr) in enumerate(meses_hist):
            ig, tt, bl = ing_v[i], tot_v[i], bal_v[i]
            bc2 = "#00b894" if bl >= 0 else "#e94560"
            is_cur = (mo == self.sel_month and yr == self.sel_year)
            fw = "bold" if is_cur else "normal"
            ctk.CTkLabel(tf, text=SH[mo-1]+" "+str(yr)[-2:],
                         font=ctk.CTkFont(size=11, weight=fw)).grid(row=i+2, column=0, padx=8, pady=3, sticky="w")
            ctk.CTkLabel(tf, text=f"${ig:,.0f}",
                         font=ctk.CTkFont(size=11), text_color="#00b894").grid(row=i+2, column=1, padx=8, pady=3, sticky="w")
            ctk.CTkLabel(tf, text=f"${tt:,.0f}",
                         font=ctk.CTkFont(size=11), text_color="#e94560").grid(row=i+2, column=2, padx=8, pady=3, sticky="w")
            ctk.CTkLabel(tf, text=f"${bl:,.0f}",
                         font=ctk.CTkFont(size=11), text_color=bc2).grid(row=i+2, column=3, padx=8, pady=3, sticky="w")
        ctk.CTkLabel(tf, text="").grid(row=9, pady=4)

        # --- Tendencia Acumulada ---
        acum_f = ctk.CTkFrame(left_col, corner_radius=12)
        acum_f.grid(row=4, column=0, sticky="ew", pady=(0,15))
        acum_f.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(acum_f, text="📈  Tendencia Acumulada",
                     font=ctk.CTkFont(size=14, weight="bold")).grid(
            row=0, column=0, padx=15, pady=(12,2), sticky="w")
        ctk.CTkLabel(acum_f, text="Ingresos vs Egresos acumulados — la brecha es tu ahorro",
                     font=ctk.CTkFont(size=11), text_color="gray").grid(
            row=1, column=0, padx=15, pady=(0,5), sticky="w")
        # Compute cumulative values
        ing_acum = []
        tot_acum = []
        run_i = 0; run_t = 0
        for iv, tv in zip(ing_v, tot_v):
            run_i += iv; run_t += tv
            ing_acum.append(run_i); tot_acum.append(run_t)
        fig_a = Figure(figsize=(9, 2.8), facecolor=bg)
        ax_a = fig_a.add_subplot(111)
        self._style_ax(ax_a, bg, tc)
        xs_a = list(range(len(meses_hist)))
        ax_a.plot(xs_a, ing_acum, color="#00b894", linewidth=2.2, marker="o",
                  markersize=5, label="Ingresos acum.", zorder=3)
        ax_a.plot(xs_a, tot_acum, color="#e94560", linewidth=2.2, marker="o",
                  markersize=5, label="Egresos acum.", zorder=3)
        # Fill gap between lines
        ax_a.fill_between(xs_a, ing_acum, tot_acum,
                          where=[i >= t for i, t in zip(ing_acum, tot_acum)],
                          color="#00b894", alpha=0.15, interpolate=True, label="Ahorro")
        ax_a.fill_between(xs_a, ing_acum, tot_acum,
                          where=[i < t for i, t in zip(ing_acum, tot_acum)],
                          color="#e94560", alpha=0.15, interpolate=True, label="Déficit")
        short_lbls = [SH[mo-1]+" "+str(yr)[-2:] for mo, yr in meses_hist]
        ax_a.set_xticks(xs_a); ax_a.set_xticklabels(short_lbls, fontsize=8, color=tc)
        ax_a.yaxis.set_major_formatter(mticker.FuncFormatter(
            lambda v, _: f"${v/1e6:.1f}M" if abs(v) >= 1e6 else f"${v:,.0f}"))
        ax_a.legend(facecolor=bg, labelcolor=tc, fontsize=8, framealpha=0.3, loc="upper left")
        fig_a.tight_layout(pad=1.0)
        cv_a = FigureCanvasTkAgg(fig_a, master=acum_f); cv_a.draw()
        cv_a.get_tk_widget().grid(row=2, column=0, padx=10, pady=(0,12), sticky="ew")
        # Summary values
        ahorro_acum = ing_acum[-1] - tot_acum[-1] if ing_acum else 0
        ah_clr = "#00b894" if ahorro_acum >= 0 else "#e94560"
        ah_lbl = ctk.CTkLabel(acum_f, text=f"{'Ahorro' if ahorro_acum >= 0 else 'Déficit'} acumulado: ${abs(ahorro_acum):,.0f}",
                     font=ctk.CTkFont(size=12, weight="bold"), text_color=ah_clr)
        ah_lbl.grid(row=3, column=0, padx=15, pady=(0,12), sticky="w")
        ToolTip(ah_lbl, f"Ingresos acumulados: ${ing_acum[-1]:,.0f}\nEgresos acumulados: ${tot_acum[-1]:,.0f}")

        # --- Variación Mensual (current vs previous) ---
        var_f = ctk.CTkFrame(left_col, corner_radius=12)
        var_f.grid(row=5, column=0, sticky="ew", pady=(0,15))
        var_f.grid_columnconfigure(0, weight=1)
        prev_m = self.sel_month - 1 if self.sel_month > 1 else 12
        prev_y = self.sel_year if self.sel_month > 1 else self.sel_year - 1
        ctk.CTkLabel(var_f, text=f"📊  Variación vs {SH[prev_m-1]} {prev_y}",
                     font=ctk.CTkFont(size=14, weight="bold")).pack(
            anchor="w", padx=15, pady=(12,2))
        ctk.CTkLabel(var_f, text="Qué subió, qué bajó y qué es nuevo respecto al mes anterior",
                     font=ctk.CTkFont(size=11), text_color="gray").pack(
            anchor="w", padx=15, pady=(0,8))
        # Gather current month gastos
        cur_gastos = {}
        for r in fijos_list:
            m_ars = self._pesificar(r[2], r[3] if len(r) > 3 else 'ARS')
            cur_gastos[r[1]] = m_ars
        for r in mens_list:
            m_ars = self._pesificar(r[2], r[4] if len(r) > 4 else 'ARS')
            cur_gastos[r[1]] = cur_gastos.get(r[1], 0) + m_ars
        # Gather previous month gastos
        prev_gastos = {}
        with get_conn() as c:
            for row in c.execute("SELECT nombre,monto,moneda FROM gastos_fijos WHERE activo=1").fetchall():
                pm = self._pesificar(row[1], row[2] if len(row) > 2 else 'ARS')
                prev_gastos[row[0]] = pm
            for row in c.execute("SELECT nombre,monto,moneda FROM gastos_mensuales WHERE mes=? AND anio=?",
                                  (prev_m, prev_y)).fetchall():
                pm = self._pesificar(row[1], row[2] if len(row) > 2 else 'ARS')
                prev_gastos[row[0]] = prev_gastos.get(row[0], 0) + pm
        # Compute variations
        all_names = set(list(cur_gastos.keys()) + list(prev_gastos.keys()))
        variations = []
        for name in all_names:
            cur_v = cur_gastos.get(name, 0)
            prev_v = prev_gastos.get(name, 0)
            diff = cur_v - prev_v
            if diff != 0:
                variations.append((name, prev_v, cur_v, diff))
        variations.sort(key=lambda x: abs(x[3]), reverse=True)
        # Header
        hdr_var = ctk.CTkFrame(var_f, fg_color=("gray80","gray25"), corner_radius=6)
        hdr_var.pack(fill="x", padx=12, pady=(0,4))
        for ci, (h, w) in enumerate([("Concepto", 180), ("Anterior", 90), ("Actual", 90), ("Cambio", 100)]):
            ctk.CTkLabel(hdr_var, text=h, font=ctk.CTkFont(size=11, weight="bold"),
                         width=w).grid(row=0, column=ci, padx=6, pady=6)
        if not variations:
            ctk.CTkLabel(var_f, text="Sin cambios respecto al mes anterior",
                         text_color="gray", font=ctk.CTkFont(size=12)).pack(padx=20, pady=15)
        else:
            for vi, (v_name, v_prev, v_cur, v_diff) in enumerate(variations[:8]):
                row_bg = ("gray92","gray20") if vi % 2 == 0 else ("gray88","gray24")
                vr = ctk.CTkFrame(var_f, fg_color=row_bg, corner_radius=4)
                vr.pack(fill="x", padx=12, pady=1)
                ctk.CTkLabel(vr, text=v_name, font=ctk.CTkFont(size=11),
                             width=180, anchor="w").grid(row=0, column=0, padx=6, pady=5)
                ctk.CTkLabel(vr, text=f"${v_prev:,.0f}" if v_prev > 0 else "—",
                             font=ctk.CTkFont(size=11), text_color="gray",
                             width=90).grid(row=0, column=1, padx=6, pady=5)
                ctk.CTkLabel(vr, text=f"${v_cur:,.0f}" if v_cur > 0 else "—",
                             font=ctk.CTkFont(size=11), width=90).grid(row=0, column=2, padx=6, pady=5)
                # Diff with arrow and color
                if v_prev == 0:
                    diff_txt = "🆕 Nuevo"
                    diff_clr = "#0984e3"
                elif v_cur == 0:
                    diff_txt = "🗑 Eliminado"
                    diff_clr = "gray"
                elif v_diff > 0:
                    diff_txt = f"▲ +${v_diff:,.0f}"
                    diff_clr = "#e94560"
                else:
                    diff_txt = f"▼ -${abs(v_diff):,.0f}"
                    diff_clr = "#00b894"
                ctk.CTkLabel(vr, text=diff_txt, font=ctk.CTkFont(size=11, weight="bold"),
                             text_color=diff_clr, width=100).grid(row=0, column=3, padx=6, pady=5)
        ctk.CTkLabel(var_f, text="").pack(pady=4)

        # ==================== RIGHT COLUMN: DESGLOSE DEL MES ====================
        right_col = ctk.CTkFrame(main_layout, corner_radius=12)
        right_col.grid(row=0, column=1, sticky="nsew")
        right_col.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(right_col, text="DESGLOSE DEL MES",
                     font=ctk.CTkFont(size=12, weight="bold"),
                     text_color="gray").grid(row=0, column=0, padx=15, pady=(15,10), sticky="w")

        # Expandable desglose items
        desglose_items = [
            ("Ingresos",          ing, "#00b894", [("Sueldo", s), ("Otros", o)]),
            ("Egresos fijos",     fij, "#e94560",
             [(r[1], self._pesificar(r[2], r[3] if len(r)>3 else 'ARS')) for r in fijos_list]),
            ("Cuotas activas",    cuo, "#fdcb6e",
             [(r[1], self._pesificar(self._cuota_en_mes(r[2],r[3],r[4],r[5],r[6]),
                     r[7] if len(r)>7 else 'ARS'))
              for r in cuotas_data if self._cuota_en_mes(r[2],r[3],r[4],r[5],r[6]) > 0]),
            ("Gastos mensuales",  men, "#0984e3",
             [(r[1], self._pesificar(r[2], r[4] if len(r)>4 else 'ARS')) for r in mens_list]),
        ]
        for di, (d_label, d_val, d_clr, d_items) in enumerate(desglose_items):
            df = ctk.CTkFrame(right_col, corner_radius=10, fg_color=("gray88","gray18"))
            df.grid(row=di+1, column=0, padx=10, pady=4, sticky="ew")
            # Color accent bar
            ctk.CTkFrame(df, width=4, corner_radius=2, fg_color=d_clr).pack(
                side="left", fill="y", padx=(8,0), pady=8)
            content_f = ctk.CTkFrame(df, fg_color="transparent")
            content_f.pack(side="left", fill="both", expand=True, padx=10, pady=8)
            # Header row (clickable)
            hdr_f = ctk.CTkFrame(content_f, fg_color="transparent")
            hdr_f.pack(fill="x")
            ctk.CTkLabel(hdr_f, text=d_label, font=ctk.CTkFont(size=11),
                         text_color=d_clr).pack(side="left")
            pct_txt = f"  ({d_val/ing*100:.0f}%)" if ing > 0 and d_label != "Ingresos" else ""
            ctk.CTkLabel(hdr_f, text=f"$ {d_val:,.0f}{pct_txt}", font=ctk.CTkFont(size=18, weight="bold"),
                         text_color=d_clr).pack(anchor="w")
            # Expandable detail
            if d_items:
                detail_f = ctk.CTkFrame(content_f, fg_color="transparent")
                detail_f._visible = False
                def _toggle(fr=detail_f):
                    if fr._visible:
                        fr.pack_forget()
                        fr._visible = False
                    else:
                        fr.pack(fill="x", pady=(4,0))
                        fr._visible = True
                expand_btn = ctk.CTkButton(hdr_f, text="▾", width=28, height=22,
                    fg_color="transparent", hover_color=("gray78","gray28"),
                    text_color=d_clr, font=ctk.CTkFont(size=14),
                    command=_toggle)
                expand_btn.pack(side="right", pady=0)
                ToolTip(expand_btn, "Click para ver detalles")
                for sub_name, sub_val in d_items:
                    if sub_val > 0:
                        sf = ctk.CTkFrame(detail_f, fg_color="transparent")
                        sf.pack(fill="x", padx=(8,0), pady=1)
                        ctk.CTkLabel(sf, text=f"  · {sub_name}", font=ctk.CTkFont(size=10),
                                     text_color="gray").pack(side="left")
                        ctk.CTkLabel(sf, text=f"${sub_val:,.0f}", font=ctk.CTkFont(size=10),
                                     text_color=d_clr).pack(side="right")

        # Total egresos
        tot_f = ctk.CTkFrame(right_col, fg_color="transparent")
        tot_f.grid(row=len(desglose_items)+1, column=0, padx=15, pady=(8,5), sticky="ew")
        ctk.CTkLabel(tot_f, text="Total egresos", font=ctk.CTkFont(size=12),
                     text_color="gray").pack(side="left")
        ctk.CTkLabel(tot_f, text=f"$ {tot:,.0f}", font=ctk.CTkFont(size=14, weight="bold"),
                     text_color="#e94560").pack(side="right")

        # Separator
        ctk.CTkFrame(right_col, height=1, fg_color="gray40").grid(
            row=len(desglose_items)+2, column=0, padx=12, pady=8, sticky="ew")

        # --- Compromiso de Ingresos (dynamic semaphore color) ---
        comp_f = ctk.CTkFrame(right_col, fg_color="transparent")
        comp_f.grid(row=len(desglose_items)+3, column=0, padx=15, pady=(0,5), sticky="ew")
        ctk.CTkLabel(comp_f, text="Compromiso de Ingresos",
                     font=ctk.CTkFont(size=13, weight="bold")).grid(
            row=0, column=0, columnspan=2, sticky="w", pady=(0,5))
        pct_comp = min(tot / ing * 100, 100) if ing > 0 else 0
        ctk.CTkLabel(comp_f, text=f"${tot:,.0f} de ${ing:,.0f}",
                     font=ctk.CTkFont(size=11), text_color="gray").grid(
            row=1, column=0, sticky="w")
        comp_pct_clr = semaphore_color(pct_comp)
        ctk.CTkLabel(comp_f, text=f"{pct_comp:.0f}%",
                     font=ctk.CTkFont(size=11, weight="bold"),
                     text_color=comp_pct_clr).grid(
            row=1, column=1, sticky="e")
        comp_f.grid_columnconfigure(1, weight=1)
        # Progress bar with gradient color
        pb_comp = ctk.CTkProgressBar(comp_f, height=12, corner_radius=6,
                                      progress_color=comp_pct_clr)
        pb_comp.set(pct_comp / 100)
        pb_comp.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(4,5))
        # Estado label
        if pct_comp < 60: estado, est_clr = "Saludable", "#00b894"
        elif pct_comp < 80: estado, est_clr = "Moderado", "#fdcb6e"
        elif pct_comp < 95: estado, est_clr = "Elevado", "#e17055"
        else: estado, est_clr = "Critico", "#e94560"
        est_f = ctk.CTkFrame(comp_f, fg_color="transparent")
        est_f.grid(row=3, column=0, columnspan=2, sticky="ew", pady=(0,5))
        ctk.CTkLabel(est_f, text="Estado", font=ctk.CTkFont(size=11),
                     text_color="gray").pack(side="left")
        ctk.CTkLabel(est_f, text=estado, font=ctk.CTkFont(size=11, weight="bold"),
                     text_color=est_clr).pack(side="right")

        # Separator
        ctk.CTkFrame(right_col, height=1, fg_color="gray40").grid(
            row=len(desglose_items)+4, column=0, padx=12, pady=8, sticky="ew")

        # Committed vs Available mini cards
        mini_f = ctk.CTkFrame(right_col, fg_color="transparent")
        mini_f.grid(row=len(desglose_items)+5, column=0, padx=10, pady=(0,15), sticky="ew")
        mini_f.grid_columnconfigure((0,1), weight=1)
        for mi, (m_title, m_val, m_clr) in enumerate([
            ("Comprometido", f"{pct_comp:.0f}%", "#e94560"),
            ("Disponible",   f"{100-pct_comp:.0f}%", "#00b894"),
        ]):
            mf = ctk.CTkFrame(mini_f, fg_color="transparent")
            mf.grid(row=0, column=mi, padx=5)
            ctk.CTkLabel(mf, text=m_title, font=ctk.CTkFont(size=10),
                         text_color="gray").pack()
            ctk.CTkLabel(mf, text=m_val, font=ctk.CTkFont(size=20, weight="bold"),
                         text_color=m_clr).pack()


        # ─── Tarjetas Overview ─────────────────────────────────────
        with get_conn() as _tc:
            _tarjetas_ov = _tc.execute("SELECT id, nombre, tipo FROM tarjetas WHERE activa=1").fetchall()
        if not _tarjetas_ov:
            # No tarjetas - still show metas
            self._metas_dashboard_row(right_col, len(desglose_items)+6)
        if _tarjetas_ov:
            ctk.CTkFrame(right_col, height=1, fg_color="gray40").grid(
                row=len(desglose_items)+6, column=0, padx=12, pady=8, sticky="ew")
            ctk.CTkLabel(right_col, text="TARJETAS",
                         font=ctk.CTkFont(size=12, weight="bold"),
                         text_color="gray").grid(row=len(desglose_items)+7, column=0, padx=15, pady=(0,8), sticky="w")
            for tov_i, (tov_id, tov_nombre, tov_tipo) in enumerate(_tarjetas_ov):
                with get_conn() as _tc2:
                    tov_rows = _tc2.execute(
                        "SELECT monto_cuota, cuota_actual, total_cuotas, mes_inicio, anio_inicio, moneda"
                        " FROM cuotas WHERE activa=1 AND tarjeta_id=?", (tov_id,)).fetchall()
                tov_total = sum(
                    self._pesificar(self._cuota_en_mes(r[0],r[1],r[2],r[3],r[4]),
                    r[5] if len(r)>5 else "ARS") for r in tov_rows)
                is_visa = tov_tipo.upper() == "VISA"
                tov_clr = "#0984e3" if is_visa else "#e94560"
                tov_icon = "🔵" if is_visa else "🔴"
                tov_f = ctk.CTkFrame(right_col, corner_radius=8, fg_color=("gray88","gray18"))
                tov_f.grid(row=len(desglose_items)+8+tov_i, column=0, padx=10, pady=3, sticky="ew")
                ctk.CTkFrame(tov_f, width=4, corner_radius=2, fg_color=tov_clr).pack(
                    side="left", fill="y", padx=(6,0), pady=6)
                tov_inner = ctk.CTkFrame(tov_f, fg_color="transparent")
                tov_inner.pack(side="left", fill="both", expand=True, padx=8, pady=6)
                tov_hdr = ctk.CTkFrame(tov_inner, fg_color="transparent")
                tov_hdr.pack(fill="x")
                ctk.CTkLabel(tov_hdr, text=f"{tov_icon} {tov_nombre}",
                             font=ctk.CTkFont(size=10), text_color=tov_clr).pack(side="left")
                ctk.CTkLabel(tov_hdr, text=tov_tipo, font=ctk.CTkFont(size=9),
                             text_color="gray").pack(side="right")
                ctk.CTkLabel(tov_inner, text=f"$ {tov_total:,.0f}",
                             font=ctk.CTkFont(size=16, weight="bold"), text_color=tov_clr).pack(anchor="w")
                if not tov_rows:
                    ctk.CTkLabel(tov_inner, text="Sin cuotas asignadas",
                                 font=ctk.CTkFont(size=9), text_color="gray").pack(anchor="w")
        # Metas de ahorro mini-panel in right col
        self._metas_dashboard_row(right_col, len(desglose_items)+8+len(_tarjetas_ov))
    def _metas_dashboard_row(self, parent, start_row):
        """Render metas de ahorro mini-panel inside dashboard right_col."""
        with get_conn() as c:
            metas = c.execute(
                "SELECT nombre, objetivo, acumulado FROM metas_ahorro "
                "WHERE activa=1 ORDER BY prioridad DESC LIMIT 3").fetchall()
        if not metas:
            return
        ctk.CTkFrame(parent, height=1, fg_color="gray40").grid(
            row=start_row, column=0, padx=12, pady=8, sticky="ew")
        ctk.CTkLabel(parent, text="METAS DE AHORRO",
                     font=ctk.CTkFont(size=12, weight="bold"),
                     text_color="gray").grid(row=start_row+1, column=0, padx=15, pady=(0,6), sticky="w")
        for mi, (mnm, mobj, macu) in enumerate(metas):
            pct = min(macu / mobj, 1.0) if mobj > 0 else 0
            pct_clr = "#00b894" if pct >= 0.6 else "#fdcb6e" if pct >= 0.3 else "#e94560"
            mf = ctk.CTkFrame(parent, corner_radius=8, fg_color=("gray88","gray18"))
            mf.grid(row=start_row+2+mi, column=0, padx=10, pady=3, sticky="ew")
            mf.grid_columnconfigure(0, weight=1)
            mhdr = ctk.CTkFrame(mf, fg_color="transparent")
            mhdr.pack(fill="x", padx=10, pady=(8,2))
            ctk.CTkLabel(mhdr, text=mnm, font=ctk.CTkFont(size=11),
                         text_color=pct_clr).pack(side="left")
            ctk.CTkLabel(mhdr, text=f"{pct*100:.0f}%",
                         font=ctk.CTkFont(size=11, weight="bold"),
                         text_color=pct_clr).pack(side="right")
            pb_m = ctk.CTkProgressBar(mf, height=8, corner_radius=4, progress_color=pct_clr)
            pb_m.set(pct); pb_m.pack(fill="x", padx=10, pady=(0,4))
            mfoot = ctk.CTkFrame(mf, fg_color="transparent")
            mfoot.pack(fill="x", padx=10, pady=(0,6))
            ctk.CTkLabel(mfoot, text=f"${macu:,.0f} de ${mobj:,.0f}",
                         font=ctk.CTkFont(size=10), text_color="gray").pack(side="left")

    def _page_ingresos(self):
        self._title("Ingresos del Mes")
        s, o = self._ing()
        frm = ctk.CTkFrame(self.cf, corner_radius=12)
        frm.grid(row=1, column=0, sticky="ew")
        ctk.CTkLabel(frm, text="💰  Registrar Ingresos",
                     font=ctk.CTkFont(size=F_SECTION, weight="bold"),
                     text_color=CLR_TEXT).grid(
            row=0, column=0, columnspan=2, padx=20, pady=(20,10), sticky="w")
        self._ie = {}
        for i, (lbl, v, ph) in enumerate([
            ("Sueldo Mensual ($):", s, "Ej: 650000"),
            ("Otros Ingresos ($):", o, "Ej: 50000 (freelance, etc)"),
        ]):
            ctk.CTkLabel(frm, text=lbl, font=ctk.CTkFont(size=F_BODY),
                         text_color=CLR_TEXT_SEC).grid(
                row=i+1, column=0, padx=20, pady=8, sticky="w")
            e = ctk.CTkEntry(frm, placeholder_text=ph, width=250,
                             border_color=INPUT_BORDER,
                             font=ctk.CTkFont(size=F_BODY))
            if v: e.insert(0, str(v))
            e.grid(row=i+1, column=1, padx=20, pady=8, sticky="w")
            self._ie[lbl] = e
        ctk.CTkButton(frm, text="💾  Guardar Ingresos", fg_color="#00b894",
                       hover_color="#00a381", font=ctk.CTkFont(size=F_BODY, weight="bold"),
                       command=self._save_ingresos, width=200, height=38,
                       corner_radius=10).grid(
            row=3, column=0, columnspan=2, padx=20, pady=(10,20))

    def _save_ingresos(self):
        try:
            s = float(self._ie["Sueldo Mensual ($):"].get().replace(",",".") or 0)
            o = float(self._ie["Otros Ingresos ($):"].get().replace(",",".") or 0)
            with get_conn() as c:
                c.execute(
                    "INSERT INTO ingresos(mes,anio,sueldo,otros) VALUES(?,?,?,?) "
                    "ON CONFLICT(mes,anio) DO UPDATE SET sueldo=excluded.sueldo, otros=excluded.otros",
                    (self.sel_month, self.sel_year, s, o))
            self._toast("Ingresos guardados correctamente")
            self._page_ingresos()
        except ValueError:
            self._toast("Ingrese valores numericos validos", "#e94560")

    def _page_fijos(self):
        self._title(f"Gastos Fijos — {self.MONTHS[self.sel_month-1]} {self.sel_year}")
        csf = ctk.CTkFrame(self.cf, fg_color="transparent")
        csf.grid(row=1, column=0, sticky="ew", pady=(0,5))
        ctk.CTkLabel(csf, text=f"💱 Dolar Oficial: ${self.dolar:,.2f}",
                     font=ctk.CTkFont(size=11), text_color="gray").pack(side="right", padx=20)
        dolar = self.dolar
        def _fijo_mapper(r):
            moneda = r[3] if len(r) > 3 else 'ARS'
            if moneda == 'USD':
                ars = r[2] * dolar
                return (r[0], r[1], f"USD {r[2]:,.2f} (≈${ars:,.0f})", '🇺🇸 USD')
            return (r[0], r[1], f"${r[2]:,.2f}", 'ARS')
        self._form_lista(
            "Agregar Gasto Fijo",
            [("Descripcion:", ""), ("Monto:", ""), ("Moneda:", ["ARS", "USD"])],
            self._save_fijo, self._fijos, self._del_fijo,
            ["#", "Descripcion", "Monto", "Moneda", ""],
            _fijo_mapper)

    def _save_fijo(self, es):
        n = es[0].get().strip()
        if not n: self._toast("Ingrese nombre", "#e94560"); return
        try:
            m = float(es[1].get().replace(",",".")); assert m > 0
        except Exception: self._toast("Monto invalido", "#e94560"); return
        moneda = es[2].get().strip().upper() if len(es) > 2 else 'ARS'
        if moneda not in ('ARS','USD'): moneda = 'ARS'
        with get_conn() as c:
            c.execute("INSERT INTO gastos_fijos(nombre,monto,moneda,mes,anio) VALUES(?,?,?,?,?)",
                      (n, m, moneda, self.sel_month, self.sel_year))
        badge = f" 🇺🇸" if moneda == 'USD' else ""
        self._toast(f"Gasto fijo '{n}' agregado para {self.MONTHS[self.sel_month-1]} {self.sel_year}{badge}")
        self._page_fijos()

    def _del_fijo(self, id_, name=""):
        self._confirm_delete(name or "gasto fijo", lambda: self._do_del_fijo(id_))

    def _do_del_fijo(self, id_):
        with get_conn() as c:
            c.execute("UPDATE gastos_fijos SET activo=0 WHERE id=?", (id_,))
        self._toast("Gasto fijo eliminado")
        self._page_fijos()

    def _page_mensuales(self):
        self._title("Gastos del Mes")
        csf = ctk.CTkFrame(self.cf, fg_color="transparent")
        csf.grid(row=1, column=0, sticky="ew", pady=(0,5))
        ctk.CTkLabel(csf, text=f"💱 Dolar Oficial: ${self.dolar:,.2f}",
                     font=ctk.CTkFont(size=11), text_color="gray").pack(side="right", padx=20)
        dolar = self.dolar
        def _mens_mapper(r):
            moneda = r[4] if len(r) > 4 else 'ARS'
            if moneda == 'USD':
                ars = r[2] * dolar
                return (r[0], r[1], f"USD {r[2]:,.2f} (≈${ars:,.0f})", r[3], '🇺🇸 USD')
            return (r[0], r[1], f"${r[2]:,.2f}", r[3], 'ARS')
        self._form_lista(
            "Agregar Gasto Mensual",
            [("Descripcion:", ""), ("Monto:", ""), ("Categoria:", "General"), ("Moneda:", ["ARS", "USD"])],
            self._save_mensual, self._mens, self._del_mensual,
            ["#", "Descripcion", "Monto", "Categoria", "Moneda", ""],
            _mens_mapper)

    def _save_mensual(self, es):
        n = es[0].get().strip()
        if not n: self._toast("Ingrese descripcion", "#e94560"); return
        try:
            m = float(es[1].get().replace(",",".")); assert m > 0
        except Exception: self._toast("Monto invalido", "#e94560"); return
        cat = es[2].get().strip() or "General"
        moneda = es[3].get().strip().upper() if len(es) > 3 else 'ARS'
        if moneda not in ('ARS','USD'): moneda = 'ARS'
        with get_conn() as c:
            c.execute(
                "INSERT INTO gastos_mensuales(mes,anio,nombre,monto,categoria,moneda) VALUES(?,?,?,?,?,?)",
                (self.sel_month, self.sel_year, n, m, cat, moneda))
        badge = f" 🇺🇸" if moneda == 'USD' else ""
        self._toast(f"Gasto '{n}' agregado{badge}")
        self._page_mensuales()

    def _del_mensual(self, id_, name=""):
        self._confirm_delete(name or "gasto mensual", lambda: self._do_del_mensual(id_))

    def _do_del_mensual(self, id_):
        with get_conn() as c:
            c.execute("DELETE FROM gastos_mensuales WHERE id=?", (id_,))
        self._toast("Gasto mensual eliminado")
        self._page_mensuales()

    def _page_cuotas(self):
        self._title("Gestion de Cuotas")
        with get_conn() as _c:
            _tarjetas = _c.execute("SELECT id, nombre, tipo FROM tarjetas WHERE activa=1").fetchall()
        tarjeta_opts = ["Sin tarjeta"] + [f"{t[1]} ({t[2]})" for t in _tarjetas]
        tarjeta_ids  = [None] + [t[0] for t in _tarjetas]
        frm = ctk.CTkFrame(self.cf, corner_radius=12)
        frm.grid(row=1, column=0, sticky="ew", pady=(0,20))
        ctk.CTkLabel(frm, text="Agregar Nueva Cuota",
                     font=ctk.CTkFont(size=15, weight="bold")).grid(
            row=0, column=0, columnspan=6, padx=20, pady=(15,10), sticky="w")
        self._ce = []
        for i, (lbl, ph) in enumerate([
            ("Descripcion:", "Ej: Celular"),
            ("Monto por cuota ($):", "Ej: 5000"),
            ("Cuota actual (N):", "Ej: 1"),
            ("Total de cuotas:", "Ej: 12"),
        ]):
            col = (i % 2) * 2; row = 1 + i // 2
            ctk.CTkLabel(frm, text=lbl, font=ctk.CTkFont(size=12)).grid(
                row=row, column=col, padx=(20,5), pady=6, sticky="w")
            e = ctk.CTkEntry(frm, placeholder_text=ph, width=185)
            e.grid(row=row, column=col+1, padx=(0,20), pady=6, sticky="w")
            self._ce.append(e)
        ctk.CTkLabel(frm, text="Tarjeta:", font=ctk.CTkFont(size=12)).grid(
            row=3, column=0, padx=(20,5), pady=6, sticky="w")
        self._cuota_tarjeta_var = ctk.StringVar(value=tarjeta_opts[0])
        self._cuota_tarjeta_ids = tarjeta_ids
        self._cuota_tarjeta_opts = tarjeta_opts
        tarj_combo = ctk.CTkComboBox(frm, values=tarjeta_opts, variable=self._cuota_tarjeta_var,
                                      width=220, state="readonly", font=ctk.CTkFont(size=12))
        tarj_combo.grid(row=3, column=1, padx=(0,20), pady=6, sticky="w")
        ctk.CTkLabel(frm, text="Moneda:", font=ctk.CTkFont(size=12)).grid(
            row=3, column=2, padx=(20,5), pady=6, sticky="w")
        self._cuota_moneda_var = ctk.StringVar(value="ARS")
        mon_combo = ctk.CTkComboBox(frm, values=["ARS","USD"], variable=self._cuota_moneda_var,
                                     width=100, state="readonly", font=ctk.CTkFont(size=12))
        mon_combo.grid(row=3, column=3, padx=(0,20), pady=6, sticky="w")
        ctk.CTkButton(frm, text="Agregar Cuota", fg_color="#6c5ce7", hover_color="#5a4bd1",
                       command=self._save_cuota, width=160).grid(
            row=4, column=0, columnspan=6, padx=20, pady=(10,20))
        lst = ctk.CTkFrame(self.cf, corner_radius=12)
        lst.grid(row=2, column=0, sticky="ew")
        lst.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(lst, text="Cuotas Activas",
                     font=ctk.CTkFont(size=15, weight="bold")).grid(
            row=0, column=0, padx=20, pady=(15,5), sticky="w")
        hdrs = ["Descripcion", "Tarjeta", "$/Cuota", "Progreso", "Saldo Pend.", "Este Mes", "", ""]
        hr = ctk.CTkFrame(lst, fg_color=("gray80","gray25"), corner_radius=6)
        hr.grid(row=1, column=0, padx=10, pady=(0,5), sticky="ew")
        for ci, h in enumerate(hdrs):
            hr.grid_columnconfigure(ci, weight=1)
            ctk.CTkLabel(hr, text=h, font=ctk.CTkFont(size=12, weight="bold"),
                         anchor="center").grid(row=0, column=ci, padx=5, pady=8, sticky="ew")
        cuotas = self._cuotas()
        paused_set = self._get_paused_set(self.sel_month, self.sel_year)
        with get_conn() as _c2:
            t_map = {t[0]: f"{t[1]} ({t[2]})" for t in _c2.execute("SELECT id,nombre,tipo FROM tarjetas WHERE activa=1").fetchall()}
        if not cuotas:
            ctk.CTkLabel(lst, text="Sin cuotas registradas.",
                         text_color="gray").grid(row=2, column=0, padx=20, pady=20)
        else:
            for ri, rd in enumerate(cuotas):
                id_, nm, mc, ca, tc, mi, yi, moneda = rd[:8]
                tarjeta_id = rd[8] if len(rd) > 8 else None
                rest  = tc - ca + 1; saldo = rest * mc
                is_paused = id_ in paused_set
                este  = self._cuota_en_mes(mc, ca, tc, mi, yi, cuota_id=id_)
                prog  = (ca - 1) / tc if tc > 0 else 0
                row_bg = ("gray82","gray28") if is_paused else ("gray90","gray20")
                r = ctk.CTkFrame(lst, fg_color=row_bg, corner_radius=6)
                r.grid(row=ri+2, column=0, padx=10, pady=2, sticky="ew")
                for col_i in range(8): r.grid_columnconfigure(col_i, weight=1)
                nm_f = ctk.CTkFrame(r, fg_color="transparent")
                nm_f.grid(row=0, column=0, padx=8, pady=8, sticky="ew")
                ctk.CTkLabel(nm_f, text=nm, anchor="center",
                             font=ctk.CTkFont(size=12)).pack(anchor="center")
                if rest <= 3:
                    ctk.CTkLabel(nm_f, text=f"🔥 {rest} cuota(s)",
                                 font=ctk.CTkFont(size=9, weight="bold"),
                                 text_color="#e94560").pack(anchor="center")
                else:
                    ctk.CTkLabel(nm_f, text=f"📅 {rest} meses",
                                 font=ctk.CTkFont(size=9),
                                 text_color=CLR_TEXT_MUTED).pack(anchor="center")
                t_txt = t_map.get(tarjeta_id, "—") if tarjeta_id else "—"
                t_clr = "#0984e3" if "VISA" in t_txt.upper() else "#e94560" if "MASTER" in t_txt.upper() else "gray"
                ctk.CTkLabel(r, text=t_txt, font=ctk.CTkFont(size=10, weight="bold"),
                             text_color=t_clr, anchor="center").grid(row=0, column=1, padx=5, sticky="ew")
                ctk.CTkLabel(r, text=f"${mc:,.0f}", anchor="center").grid(row=0, column=2, padx=5, sticky="ew")
                pf = ctk.CTkFrame(r, fg_color="transparent")
                pf.grid(row=0, column=3, padx=5, sticky="ew")
                prog_clr = "#e94560" if rest <= 3 else "#6c5ce7"
                pb = ctk.CTkProgressBar(pf, width=115, progress_color=prog_clr)
                pb.pack(pady=(8,2)); pb.set(prog)
                ctk.CTkLabel(pf, text=f"{ca-1}/{tc}  ({prog*100:.0f}%)",
                             font=ctk.CTkFont(size=10), text_color="gray").pack()
                ctk.CTkLabel(r, text=f"${saldo:,.0f}", text_color="#e94560",
                             font=ctk.CTkFont(weight="bold"), anchor="center").grid(row=0, column=4, padx=5, sticky="ew")
                este_txt = "PAUSADO" if is_paused else f"${este:,.0f}"
                este_clr = "gray" if is_paused else ("#00b894" if este > 0 else "gray")
                ctk.CTkLabel(r, text=este_txt,
                             text_color=este_clr, anchor="center",
                             font=ctk.CTkFont(size=11, weight="bold" if is_paused else "normal")).grid(
                    row=0, column=5, padx=5, sticky="ew")
                # Pause/unpause button
                def _toggle_pause(cid=id_, cur_paused=is_paused):
                    with get_conn() as _cp:
                        if cur_paused:
                            _cp.execute("DELETE FROM cuotas_pausadas WHERE cuota_id=? AND mes=? AND anio=?",
                                        (cid, self.sel_month, self.sel_year))
                            self._toast("Cuota reactivada")
                        else:
                            _cp.execute("INSERT OR IGNORE INTO cuotas_pausadas(cuota_id,mes,anio) VALUES(?,?,?)",
                                        (cid, self.sel_month, self.sel_year))
                            self._toast("Cuota pausada para este mes", "#fdcb6e")
                    self._cache.clear()
                    self._nav("cuotas")
                pause_icon = "▶" if is_paused else "⏸"
                pause_clr  = "#00b894" if is_paused else "#fdcb6e"
                ctk.CTkButton(r, text=pause_icon, width=36, fg_color=pause_clr,
                               hover_color=("gray60","gray40"), corner_radius=6,
                               command=_toggle_pause).grid(row=0, column=6, padx=(5,2), pady=6)
                ctk.CTkButton(r, text="🗑", width=36, fg_color=BTN_DANGER_FG, hover_color=BTN_DANGER_HOVER,
                               corner_radius=6,
                               command=lambda i=id_: self._del_cuota(i)).grid(
                    row=0, column=7, padx=(2,8), pady=6)
        ctk.CTkLabel(lst, text="").grid(row=len(cuotas)+3, pady=5)


    def _save_cuota(self):
        try:
            n  = self._ce[0].get().strip()
            mc = float(self._ce[1].get().replace(",","."))
            ca = int(self._ce[2].get())
            tc = int(self._ce[3].get())
            if not n or mc <= 0 or ca < 1 or tc < 1 or ca > tc:
                raise ValueError("Datos invalidos")
        except ValueError as e:
            self._toast(str(e), "#e94560"); return
        moneda = getattr(self, "_cuota_moneda_var", None)
        moneda = moneda.get() if moneda else "ARS"
        tarjeta_id = None
        if hasattr(self, "_cuota_tarjeta_var") and hasattr(self, "_cuota_tarjeta_opts"):
            sel_txt = self._cuota_tarjeta_var.get()
            try:
                sel_idx = self._cuota_tarjeta_opts.index(sel_txt)
                tarjeta_id = self._cuota_tarjeta_ids[sel_idx]
            except (ValueError, IndexError):
                tarjeta_id = None
        with get_conn() as c:
            c.execute(
                "INSERT INTO cuotas(nombre,monto_cuota,cuota_actual,total_cuotas,"
                "mes_inicio,anio_inicio,moneda,tarjeta_id) VALUES(?,?,?,?,?,?,?,?)",
                (n, mc, ca, tc, self.sel_month, self.sel_year, moneda, tarjeta_id))
        self._toast(f"Cuota agregada: {n} ({moneda})")
        self._page_cuotas()
    def _del_cuota(self, id_, name=""):
        self._confirm_delete(name or "cuota", lambda: self._do_del_cuota(id_))

    def _do_del_cuota(self, id_):
        with get_conn() as c:
            c.execute("UPDATE cuotas SET activa=0 WHERE id=?", (id_,))
        self._toast("Cuota eliminada")
        self._page_cuotas()

    def _form_lista(self, title, fields, save_fn, get_fn, del_fn, cols, mapper,
                    table_name=None, refresh_fn=None):
        frm = ctk.CTkFrame(self.cf, corner_radius=12)
        frm.grid(row=2, column=0, sticky="ew", pady=(0,20))
        ctk.CTkLabel(frm, text=title, font=ctk.CTkFont(size=F_SECTION, weight="bold"),
                     text_color=CLR_TEXT).grid(
            row=0, column=0, columnspan=len(fields)*2, padx=20, pady=(15,10), sticky="w")
        entries = []
        placeholders = {
            "Descripcion:": "Ej: Alquiler, Netflix, etc",
            "Monto:": "Ej: 15000",
            "Categoria:": "General",
        }
        for i, (lbl, ph) in enumerate(fields):
            ctk.CTkLabel(frm, text=lbl, font=ctk.CTkFont(size=F_BODY),
                         text_color=CLR_TEXT_SEC).grid(
                row=1, column=i*2, padx=(20 if i==0 else 5, 5), pady=8, sticky="w")
            if isinstance(ph, list):
                e = ctk.CTkComboBox(frm, values=ph, width=130, state="readonly",
                                    font=ctk.CTkFont(size=F_BODY))
                e.set(ph[0])
            else:
                hint = placeholders.get(lbl, ph) if not ph else ph
                e = ctk.CTkEntry(frm, placeholder_text=hint, width=185,
                                 border_color=INPUT_BORDER,
                                 font=ctk.CTkFont(size=F_BODY))
            e.grid(row=1, column=i*2+1, padx=(0,10), pady=8, sticky="w")
            entries.append(e)
        ctk.CTkButton(frm, text="✚  Agregar", fg_color=BTN_PRIMARY_FG,
                       hover_color=BTN_PRIMARY_HOVER,
                       font=ctk.CTkFont(size=F_BODY, weight="bold"),
                       command=lambda: save_fn(entries), width=150, height=36,
                       corner_radius=10).grid(
            row=2, column=0, columnspan=len(fields)*2, padx=20, pady=(5,15))
        lst = ctk.CTkFrame(self.cf, corner_radius=12)
        lst.grid(row=3, column=0, sticky="ew")
        lst.grid_columnconfigure(0, weight=1)
        hr = ctk.CTkFrame(lst, fg_color=("gray78","gray22"), corner_radius=6)
        hr.grid(row=0, column=0, padx=10, pady=(10,5), sticky="ew")
        for ci, col in enumerate(cols):
            hr.grid_columnconfigure(ci, weight=1)
            ctk.CTkLabel(hr, text=col, font=ctk.CTkFont(size=F_BODY, weight="bold"),
                         text_color=CLR_TEXT, anchor="center", justify="center").grid(
                row=0, column=ci, padx=8, pady=8, sticky="ew")
        # Add placeholder cols for edit/delete buttons so header aligns with data rows
        _n_data_cols = len(cols)
        if table_name and refresh_fn:
            hr.grid_columnconfigure(_n_data_cols, weight=0)
            ctk.CTkLabel(hr, text="", width=37).grid(row=0, column=_n_data_cols, padx=(10,2), pady=8)
            _n_data_cols += 1
        hr.grid_columnconfigure(_n_data_cols, weight=0)
        ctk.CTkLabel(hr, text="", width=37).grid(row=0, column=_n_data_cols, padx=(2,10), pady=8)
        rows  = get_fn(); total = 0.0
        for ri, rd in enumerate(rows):
            mp = mapper(rd)
            rbg = ("gray92","gray20") if ri % 2 == 0 else ("gray88","gray24")
            r  = ctk.CTkFrame(lst, fg_color=rbg, corner_radius=6)
            r.grid(row=ri+1, column=0, padx=10, pady=1, sticky="ew")
            for ci, v in enumerate(mp):
                r.grid_columnconfigure(ci, weight=1)
                tc = CLR_TEXT_SEC if ci == 0 else CLR_TEXT
                ctk.CTkLabel(r, text=str(v), font=ctk.CTkFont(size=F_BODY),
                             anchor="center", justify="center", text_color=tc).grid(
                    row=0, column=ci, padx=8, pady=8, sticky="ew")
            rec_name = str(mp[1]) if len(mp) > 1 else ""
            # Edit button (P0.4)
            if table_name and refresh_fn:
                ctk.CTkButton(r, text="✏️", width=35, fg_color=("gray70","gray35"),
                               hover_color=("gray60","gray40"), corner_radius=6,
                               command=lambda rid=rd, tn=table_name, rfn=refresh_fn:
                                   self._edit_record(rid, tn, rfn)).grid(
                    row=0, column=len(mp), padx=(10,2), pady=5)
            # Delete button (P0.3 with name)
            _del_col = len(mp) + 1 if (table_name and refresh_fn) else len(mp)
            ctk.CTkButton(r, text="🗑", width=35, fg_color=BTN_DANGER_FG,
                           hover_color=BTN_DANGER_HOVER,
                           corner_radius=6,
                           command=lambda i=mp[0], n=rec_name: del_fn(i, n)).grid(
                row=0, column=_del_col, padx=(2,10), pady=5)
            try: total += float(str(mp[2]).replace("$","").replace(",",""))
            except Exception: pass
        if not rows:
            ef = ctk.CTkFrame(lst, fg_color="transparent")
            ef.grid(row=1, column=0, padx=20, pady=30)
            ctk.CTkLabel(ef, text="📋", font=ctk.CTkFont(size=32)).pack()
            ctk.CTkLabel(ef, text="Sin registros", font=ctk.CTkFont(size=F_SUBTITLE, weight="bold"),
                         text_color=CLR_TEXT_MUTED).pack(pady=(5,2))
            ctk.CTkLabel(ef, text="Usa el formulario de arriba para agregar el primero",
                         font=ctk.CTkFont(size=F_CAPTION), text_color=CLR_TEXT_MUTED).pack()
        tf = ctk.CTkFrame(lst, fg_color="transparent")
        tf.grid(row=len(rows)+1, column=0, padx=10, pady=(5,15), sticky="e")
        ctk.CTkLabel(tf, text=f"Total: ${total:,.2f}",
                     font=ctk.CTkFont(size=F_SUBTITLE, weight="bold"),
                     text_color="#00b894").pack(padx=20)

    def _edit_record(self, raw_data, table_name, refresh_fn):
        """P0.4: Open modal to edit a record's name and monto."""
        rec_id = raw_data[0]
        old_name = str(raw_data[1])
        old_monto = raw_data[2]
        d = ctk.CTkToplevel(self)
        d.title("Editar Registro")
        d.geometry("380x220")
        d.resizable(False, False)
        d.grab_set()
        d.after(10, lambda: d.focus_force())
        ctk.CTkLabel(d, text="✏️  Editar",
                     font=ctk.CTkFont(size=16, weight="bold")).pack(pady=(15,10))
        ff = ctk.CTkFrame(d, fg_color="transparent")
        ff.pack(fill="x", padx=20)
        ctk.CTkLabel(ff, text="Nombre:", font=ctk.CTkFont(size=12)).grid(row=0, column=0, sticky="w", pady=5)
        ne = ctk.CTkEntry(ff, width=220)
        ne.grid(row=0, column=1, padx=5, pady=5)
        ne.insert(0, old_name)
        ctk.CTkLabel(ff, text="Monto:", font=ctk.CTkFont(size=12)).grid(row=1, column=0, sticky="w", pady=5)
        me = ctk.CTkEntry(ff, width=220)
        me.grid(row=1, column=1, padx=5, pady=5)
        me.insert(0, str(old_monto))
        bf = ctk.CTkFrame(d, fg_color="transparent")
        bf.pack(pady=15)
        ctk.CTkButton(bf, text="Cancelar", fg_color="gray40", width=110,
                      command=d.destroy).pack(side="left", padx=5)
        def do_save():
            new_name = ne.get().strip()
            try:
                new_monto = float(me.get().replace(",","."))
                assert new_monto > 0
            except Exception:
                self._toast("Monto invalido", "#e94560"); return
            if not new_name:
                self._toast("Nombre vacio", "#e94560"); return
            col_name = "nombre"
            col_monto = "monto_cuota" if table_name == "cuotas" else "monto"
            with get_conn() as c:
                c.execute(f"UPDATE {table_name} SET {col_name}=?, {col_monto}=? WHERE id=?",
                          (new_name, new_monto, rec_id))
            d.destroy()
            self._toast(f"'{new_name}' actualizado")
            refresh_fn()
        ctk.CTkButton(bf, text="Guardar", fg_color=BTN_PRIMARY_FG,
                      hover_color=BTN_PRIMARY_HOVER, width=110,
                      command=do_save).pack(side="left", padx=5)

    def _page_graficos(self):
        self._title("Graficos y Proyecciones")
        dark = ctk.get_appearance_mode().lower() == "dark"
        bg   = "#1e1e2e" if dark else "#f5f5f5"
        tc   = "#eaeaea" if dark else "#2d3436"
        f1 = ctk.CTkFrame(self.cf, corner_radius=12)
        f1.grid(row=1, column=0, sticky="ew", pady=(0,20))
        f1.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(f1, text="Proyeccion de Deuda en Cuotas (proximos 12 meses)",
                     font=ctk.CTkFont(size=15, weight="bold")).grid(
            row=0, column=0, padx=20, pady=(15,5), sticky="w")
        cuotas = self._cuotas()
        short  = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
        xlbls, totals = [], []
        for off in range(12):
            yr = self.sel_year  + (self.sel_month + off - 1) // 12
            mo = (self.sel_month + off - 1) % 12 + 1
            xlbls.append(short[mo-1] + chr(10) + str(yr))
            totals.append(sum(
                self._cuota_en_mes(r[2],r[3],r[4],r[5],r[6],yr,mo) for r in cuotas))
        fig1 = Figure(figsize=(11, 3.5), facecolor=bg)
        ax   = fig1.add_subplot(111)
        self._style_ax(ax, bg, tc)
        x    = np.arange(12)
        bars = ax.bar(x, totals, color="#6c5ce7", alpha=0.85, width=0.6, zorder=2)
        ax.plot(x, totals, color="#e94560", marker="o", lw=2, ms=5, zorder=3)
        ax.set_xticks(x); ax.set_xticklabels(xlbls, fontsize=8, color=tc)
        ax.set_ylabel("$ Comprometido", color=tc, fontsize=10)
        ax.set_title("Cuotas comprometidas por mes", color=tc, fontsize=11)
        mx = max(totals, default=1)
        for b, v in zip(bars, totals):
            if v > 0:
                ax.text(b.get_x()+b.get_width()/2, v+mx*0.015, f"${v:,.0f}",
                        ha="center", va="bottom", color=tc, fontsize=7)
        fig1.tight_layout()
        c1 = FigureCanvasTkAgg(fig1, master=f1); c1.draw()
        c1.get_tk_widget().grid(row=1, column=0, padx=15, pady=(0,15), sticky="ew")
        f2 = ctk.CTkFrame(self.cf, corner_radius=12)
        f2.grid(row=2, column=0, sticky="ew", pady=(0,20))
        f2.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(f2, text="Distribucion de Gastos del Mes",
                     font=ctk.CTkFont(size=15, weight="bold")).grid(
            row=0, column=0, padx=20, pady=(15,5), sticky="w")
        ing, fij, men, cuo, tot, bal = self._resumen()
        fig2 = Figure(figsize=(11, 4), facecolor=bg)
        gs   = fig2.add_gridspec(1, 2, wspace=0.35)
        ap   = fig2.add_subplot(gs[0,0]); ab = fig2.add_subplot(gs[0,1])
        for ax2 in (ap, ab):
            self._style_ax(ax2, bg, tc)
        nz = [(s,l,c) for s,l,c in zip(
                [fij, men, cuo, max(bal,0)],
                ["Fijos","Mensuales","Cuotas","Disponible"],
                ["#6c5ce7","#0984e3","#fdcb6e","#00b894"]) if s > 0]
        if nz:
            s_, l_, c_ = zip(*nz)
            wedges, _, at = ap.pie(s_, labels=l_, colors=c_, autopct="%1.1f%%",
                               startangle=140, textprops={"color":tc,"fontsize":9},
                               wedgeprops=dict(width=0.45, edgecolor=bg))
            for a in at: a.set_fontsize(8)
            # Donut center text
            ap.text(0, 0, f"${tot:,.0f}", ha="center", va="center",
                    fontsize=11, fontweight="bold", color=tc)
        else:
            ap.text(0.5, 0.5, "Sin datos", ha="center", color=tc, transform=ap.transAxes)
        ap.set_title("Distribucion", color=tc, fontsize=10)
        cats  = ["Ingresos", "G. Fijos", "G. Mens.", "Cuotas", "Balance"]
        vals  = [ing, fij, men, cuo, bal]
        bclrs = ["#00b894","#6c5ce7","#0984e3","#fdcb6e",
                 "#00b894" if bal >= 0 else "#e17055"]
        ab.bar(cats, vals, color=bclrs, width=0.55, alpha=0.9)
        ab.set_xticklabels(cats, fontsize=9, color=tc, rotation=15, ha="right")
        ab.yaxis.set_tick_params(labelcolor=tc)
        ab.set_title("Comparativa del Mes", color=tc, fontsize=10)
        ab.set_ylabel("$", color=tc, fontsize=10); ab.axhline(0, color="gray", lw=0.8)
        fig2.tight_layout()
        c2 = FigureCanvasTkAgg(fig2, master=f2); c2.draw()
        c2.get_tk_widget().grid(row=1, column=0, padx=15, pady=(0,15), sticky="ew")

    def _page_ajustes(self):
        self._title(f"Ajustes - {self.MONTHS[self.sel_month-1]} {self.sel_year}")
        frm = ctk.CTkFrame(self.cf, corner_radius=12)
        frm.grid(row=1, column=0, sticky="ew", pady=(0,20))
        frm.grid_columnconfigure(1, weight=1)
        ctk.CTkLabel(frm, text="Parametros de Proyeccion",
                     font=ctk.CTkFont(size=16, weight="bold")).grid(
            row=0, column=0, columnspan=2, padx=20, pady=(20,15), sticky="w")
        ctk.CTkLabel(frm, text="Inflacion Mensual Estimada (%):",
                     font=ctk.CTkFont(size=13)).grid(row=1, column=0, padx=20, pady=8, sticky="w")
        self._inf_entry = ctk.CTkEntry(frm, placeholder_text="Ej: 4.2", width=200)
        self._inf_entry.insert(0, str(self._get_inflacion()))
        self._inf_entry.grid(row=1, column=1, padx=20, pady=8, sticky="w")
        hint = ctk.CTkFrame(frm, fg_color=("gray85","gray20"), corner_radius=8)
        hint.grid(row=2, column=0, columnspan=2, padx=20, pady=(0,10), sticky="ew")
        ctk.CTkLabel(hint, text=("Nota: Se aplica interes compuesto sobre Gastos Fijos y Mensuales. "
            "Cuotas y sueldo se mantienen nominales."),
            font=ctk.CTkFont(size=11), text_color="gray", wraplength=700, justify="left").pack(padx=15, pady=10)
        ctk.CTkButton(frm, text="Guardar Ajustes", fg_color="#00b894", hover_color="#00a381",
                       command=self._save_ajustes, width=180).grid(
            row=3, column=0, columnspan=2, padx=20, pady=(5,20))
        self._render_tarjetas_section()
        self._render_kpi_preview()

    def _render_tarjetas_section(self):
        dark = ctk.get_appearance_mode().lower() == "dark"
        with get_conn() as c:
            tarjetas = c.execute("SELECT id, nombre, tipo, ultimos_4 FROM tarjetas WHERE activa=1").fetchall()
        tf = ctk.CTkFrame(self.cf, corner_radius=12)
        tf.grid(row=2, column=0, sticky="ew", pady=(0,20))
        tf.grid_columnconfigure(0, weight=1)
        hdr_f = ctk.CTkFrame(tf, fg_color="transparent")
        hdr_f.grid(row=0, column=0, padx=20, pady=(15,10), sticky="ew")
        ctk.CTkLabel(hdr_f, text="💳  Mis Tarjetas",
                     font=ctk.CTkFont(size=16, weight="bold")).pack(side="left")
        add_f = ctk.CTkFrame(tf, fg_color=("gray88","gray18"), corner_radius=10)
        add_f.grid(row=1, column=0, padx=20, pady=(0,15), sticky="ew")
        ctk.CTkLabel(add_f, text="Agregar tarjeta:",
                     font=ctk.CTkFont(size=12, weight="bold")).pack(side="left", padx=(15,10), pady=10)
        _t_nombre = ctk.CTkEntry(add_f, placeholder_text="Nombre (ej: Personal)", width=160, height=30)
        _t_nombre.pack(side="left", padx=5, pady=10)
        _t_tipo_var = ctk.StringVar(value="VISA")
        ctk.CTkComboBox(add_f, values=["VISA", "MASTERCARD"], variable=_t_tipo_var,
                         width=130, state="readonly", height=30).pack(side="left", padx=5, pady=10)
        _t_num = ctk.CTkEntry(add_f, placeholder_text="Ultimos 4 digitos", width=140, height=30)
        _t_num.pack(side="left", padx=5, pady=10)
        def _save_tarjeta():
            nombre = _t_nombre.get().strip()
            tipo   = _t_tipo_var.get().strip().upper()
            num    = _t_num.get().strip()
            if not nombre: self._toast("Ingrese nombre de la tarjeta", "#e94560"); return
            if tipo not in ("VISA", "MASTERCARD"): tipo = "VISA"
            if num and (not num.isdigit() or len(num) != 4):
                self._toast("Los ultimos 4 digitos deben ser exactamente 4 numeros", "#fdcb6e"); return
            with get_conn() as c:
                c.execute("INSERT INTO tarjetas(nombre, tipo, ultimos_4) VALUES(?,?,?)", (nombre, tipo, num))
            self._toast(f"Tarjeta {tipo} agregada")
            self._nav("ajustes")
        ctk.CTkButton(add_f, text="+ Agregar", fg_color=CLR_BLUE, hover_color=BTN_PRIMARY_HOVER,
                       width=90, height=30, corner_radius=8,
                       command=_save_tarjeta).pack(side="left", padx=10, pady=10)
        if not tarjetas:
            ctk.CTkLabel(tf, text="Sin tarjetas. Agrega una arriba.",
                         text_color="gray", font=ctk.CTkFont(size=12)).grid(
                row=2, column=0, padx=20, pady=20)
            ctk.CTkLabel(tf, text="").grid(row=3, pady=5)
            return
        if not hasattr(self, "_tarjeta_idx"): self._tarjeta_idx = 0
        self._tarjeta_idx = min(self._tarjeta_idx, len(tarjetas) - 1)
        carousel_f = ctk.CTkFrame(tf, fg_color="transparent")
        carousel_f.grid(row=2, column=0, padx=20, pady=(0,15), sticky="ew")
        def _prev(): self._tarjeta_idx = (self._tarjeta_idx - 1) % len(tarjetas); self._nav("ajustes")
        def _next(): self._tarjeta_idx = (self._tarjeta_idx + 1) % len(tarjetas); self._nav("ajustes")
        btn_prev = ctk.CTkButton(carousel_f, text="❮", width=36, height=36, corner_radius=18,
                       fg_color=("gray80","gray30"), hover_color=("gray70","gray40"),
                       font=ctk.CTkFont(size=18), command=_prev)
        btn_prev.pack(side="left", padx=(0,12))
        t_id, t_nombre, t_tipo, t_num = tarjetas[self._tarjeta_idx]
        is_visa = t_tipo.upper() == "VISA"
        card_bg   = "#c9a84c" if is_visa else "#1a1a2e"
        card_text = "#ffffff"
        logo_clr  = "#1a237e" if is_visa else "#ff6f00"
        card = ctk.CTkFrame(carousel_f, corner_radius=16, fg_color=card_bg, width=360, height=200)
        card.pack(side="left", padx=4)
        card.pack_propagate(False)
        logo_f = ctk.CTkFrame(card, fg_color="transparent")
        logo_f.place(x=20, y=15)
        ctk.CTkLabel(logo_f, text=t_tipo, font=ctk.CTkFont(size=22, weight="bold"),
                     text_color=logo_clr).pack(side="left")
        ctk.CTkLabel(logo_f, text=f"  {t_nombre}",
                     font=ctk.CTkFont(size=13), text_color=card_text).pack(side="left")
        num_display = f"**** **** **** {t_num}" if t_num else "**** **** **** ****"
        ctk.CTkLabel(card, text=num_display, font=ctk.CTkFont(size=18, weight="bold"),
                     text_color=card_text).place(x=20, y=85)
        ctk.CTkLabel(card, text="Fecha de vencimiento", font=ctk.CTkFont(size=9),
                     text_color=card_text).place(x=20, y=130)
        ctk.CTkLabel(card, text="**/**", font=ctk.CTkFont(size=13, weight="bold"),
                     text_color=card_text).place(x=20, y=148)
        ctk.CTkLabel(card, text="Cod. seguridad", font=ctk.CTkFont(size=9),
                     text_color=card_text).place(x=200, y=130)
        ctk.CTkLabel(card, text="***", font=ctk.CTkFont(size=13, weight="bold"),
                     text_color=card_text).place(x=200, y=148)
        def _del_t(t_id=t_id, t_nombre=t_nombre):
            def do_del():
                with get_conn() as c: c.execute("UPDATE tarjetas SET activa=0 WHERE id=?", (t_id,))
                self._tarjeta_idx = 0
                self._toast(f"Tarjeta {t_nombre} eliminada")
                self._nav("ajustes")
            self._confirm_delete(t_nombre, do_del)
        ctk.CTkButton(card, text="🗑", width=32, height=28, corner_radius=8,
                       fg_color=BTN_DANGER_FG, hover_color=BTN_DANGER_HOVER,
                       command=_del_t).place(x=310, y=15)
        ctk.CTkButton(carousel_f, text="❯", width=36, height=36, corner_radius=18,
                       fg_color=("gray80","gray30"), hover_color=("gray70","gray40"),
                       font=ctk.CTkFont(size=18), command=_next).pack(side="left", padx=(12,0))
        dots_f = ctk.CTkFrame(tf, fg_color="transparent")
        dots_f.grid(row=3, column=0, pady=(0,5))
        for di in range(len(tarjetas)):
            dot_clr = CLR_BLUE if di == self._tarjeta_idx else ("gray60" if dark else "gray75")
            ctk.CTkLabel(dots_f, text="●", font=ctk.CTkFont(size=10),
                         text_color=dot_clr).pack(side="left", padx=3)
        # ── Cuotas de esta tarjeta ─────────────────────────────────────
        with get_conn() as _ct:
            card_cuotas = _ct.execute(
                "SELECT nombre, monto_cuota, cuota_actual, total_cuotas, mes_inicio, anio_inicio, moneda "
                "FROM cuotas WHERE activa=1 AND tarjeta_id=? ORDER BY nombre",
                (t_id,)).fetchall()
        cq_f = ctk.CTkFrame(tf, fg_color=("gray88","gray18"), corner_radius=10)
        cq_f.grid(row=4, column=0, padx=20, pady=(0,10), sticky="ew")
        cq_f.grid_columnconfigure(0, weight=1)
        cq_hdr = ctk.CTkFrame(cq_f, fg_color="transparent")
        cq_hdr.grid(row=0, column=0, padx=15, pady=(10,4), sticky="ew")
        ctk.CTkLabel(cq_hdr, text="Cuotas asignadas",
                     font=ctk.CTkFont(size=12, weight="bold")).pack(side="left")
        total_future = 0.0
        if not card_cuotas:
            ctk.CTkLabel(cq_f, text="Sin cuotas asignadas a esta tarjeta",
                         font=ctk.CTkFont(size=11), text_color="gray").grid(
                row=1, column=0, padx=15, pady=(0,12))
        else:
            # Column headers
            cq_hr = ctk.CTkFrame(cq_f, fg_color=("gray78","gray22"), corner_radius=4)
            cq_hr.grid(row=1, column=0, padx=12, pady=(0,4), sticky="ew")
            for hci, htxt in enumerate(["Descripcion", "$/Cuota", "Progreso", "Faltan", "Total pend."]):
                cq_hr.grid_columnconfigure(hci, weight=1)
                ctk.CTkLabel(cq_hr, text=htxt, font=ctk.CTkFont(size=10, weight="bold"),
                             anchor="center", text_color="gray").grid(
                    row=0, column=hci, padx=6, pady=5, sticky="ew")
            for cqi, (cnm, cmc, cca, ctc, cmi, cyi, cmon) in enumerate(card_cuotas):
                rest = ctc - cca + 1
                saldo_pend = rest * cmc
                total_future += saldo_pend
                prog = (cca - 1) / ctc if ctc > 0 else 0
                # Estimate finish date
                finish_m = (cmi + ctc - 1 - 1) % 12 + 1
                finish_y = cyi + (cmi + ctc - 2) // 12
                SH = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
                finish_lbl = f"{SH[finish_m-1]} {finish_y}"
                rbg = ("gray92","gray20") if cqi % 2 == 0 else ("gray88","gray24")
                cq_r = ctk.CTkFrame(cq_f, fg_color=rbg, corner_radius=4)
                cq_r.grid(row=cqi+2, column=0, padx=12, pady=1, sticky="ew")
                for hci in range(5): cq_r.grid_columnconfigure(hci, weight=1)
                ctk.CTkLabel(cq_r, text=cnm, font=ctk.CTkFont(size=11),
                             anchor="center").grid(row=0, column=0, padx=6, pady=6, sticky="ew")
                ctk.CTkLabel(cq_r, text=f"${cmc:,.0f}", font=ctk.CTkFont(size=11),
                             anchor="center").grid(row=0, column=1, padx=6, pady=6, sticky="ew")
                pb_f = ctk.CTkFrame(cq_r, fg_color="transparent")
                pb_f.grid(row=0, column=2, padx=4, pady=4, sticky="ew")
                pb_cq = ctk.CTkProgressBar(pb_f, height=6, corner_radius=3,
                                            progress_color="#6c5ce7", width=80)
                pb_cq.set(prog); pb_cq.pack(pady=(6,1))
                ctk.CTkLabel(pb_f, text=f"{cca-1}/{ctc}", font=ctk.CTkFont(size=9),
                             text_color="gray").pack()
                clr_rest = "#e94560" if rest <= 3 else CLR_TEXT_MUTED
                ctk.CTkLabel(cq_r, text=f"{rest} cuota(s) hasta {finish_lbl}",
                             font=ctk.CTkFont(size=10), text_color=clr_rest,
                             anchor="center", justify="center").grid(
                    row=0, column=3, padx=6, pady=6, sticky="ew")
                ctk.CTkLabel(cq_r, text=f"${saldo_pend:,.0f}",
                             font=ctk.CTkFont(size=11, weight="bold"), text_color="#e94560",
                             anchor="center").grid(row=0, column=4, padx=6, pady=6, sticky="ew")
            # Total footer
            tot_f = ctk.CTkFrame(cq_f, fg_color="transparent")
            tot_f.grid(row=len(card_cuotas)+2, column=0, padx=15, pady=(6,12), sticky="e")
            ctk.CTkLabel(tot_f, text=f"Compromiso total con {t_nombre}: ",
                         font=ctk.CTkFont(size=11), text_color="gray").pack(side="left")
            ctk.CTkLabel(tot_f, text=f"${total_future:,.0f}",
                         font=ctk.CTkFont(size=13, weight="bold"), text_color="#e94560").pack(side="left")
        ctk.CTkLabel(tf, text="").grid(row=5, pady=3)

    def _save_ajustes(self):
        try:
            val = float(self._inf_entry.get().replace(",","."))
            if val < 0 or val > 100: raise ValueError("Rango invalido (0-100)")
        except ValueError as e:
            self._toast(str(e), "#e94560"); return
        with get_conn() as c:
            c.execute("INSERT INTO historial_inflacion(mes,anio,valor) VALUES(?,?,?) "
                      "ON CONFLICT(mes,anio) DO UPDATE SET valor=excluded.valor",
                      (self.sel_month, self.sel_year, val))
        self.cfg["inflacion"] = val
        save_config(self.cfg)
        self._toast(f"Inflacion {self.MONTHS[self.sel_month-1]} {self.sel_year}: {val}%")
        self._page_ajustes()

    def _render_kpi_preview(self):
        xlbls, ing_vals, gasto_vals = self._proyeccion_data()
        r_inf = self._get_inflacion()
        pct6  = (gasto_vals[6] - gasto_vals[0]) / gasto_vals[0] * 100 if gasto_vals[0] > 0 else 0
        pp6   = (ing_vals[6] - gasto_vals[6]) / ing_vals[0] * 100 if ing_vals[0] > 0 else 0
        kpi_f = ctk.CTkFrame(self.cf, corner_radius=12)
        kpi_f.grid(row=3, column=0, sticky="ew")
        kpi_f.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(kpi_f, text="Impacto de la Inflacion - Vista Rapida",
                     font=ctk.CTkFont(size=15, weight="bold")).grid(
            row=0, column=0, columnspan=3, padx=20, pady=(15,10), sticky="w")
        cf2 = ctk.CTkFrame(kpi_f, fg_color="transparent")
        cf2.grid(row=1, column=0, sticky="ew", padx=10, pady=(0,15))
        for i in range(3): cf2.grid_columnconfigure(i, weight=1)
        for col, (title, value, sub, clr) in enumerate([
            ("Inflacion Mensual", f"{r_inf:.2f}%", "configurada actualmente", "#fdcb6e"),
            ("Gastos +% en 6 meses", f"+{pct6:.1f}%", "sobre gastos variables",
             "#e17055" if pct6 > 10 else "#fdcb6e"),
            ("Balance/Ing en 6 meses", f"{pp6:+.1f}%", "cambio en poder adquisitivo",
             "#00b894" if pp6 >= 0 else "#e17055"),
        ]):
            f = ctk.CTkFrame(cf2, corner_radius=10, fg_color=("gray88","gray18"))
            f.grid(row=0, column=col, padx=8, sticky="nsew")
            ctk.CTkLabel(f, text=title, font=ctk.CTkFont(size=12),
                         text_color="gray").pack(padx=15, pady=(12,2), anchor="w")
            ctk.CTkLabel(f, text=value, font=ctk.CTkFont(size=28, weight="bold"),
                         text_color=clr).pack(padx=15, anchor="w")
            ctk.CTkLabel(f, text=sub, font=ctk.CTkFont(size=10),
                         text_color="gray").pack(padx=15, pady=(0,12), anchor="w")

    def _page_proyeccion(self):
        ing_res, fij, men, cuo, tot_g, bal_cur = self._resumen()
        dark  = ctk.get_appearance_mode().lower() == "dark"
        bg    = "#1e1e2e" if dark else "#f5f5f5"
        tc    = "#eaeaea" if dark else "#2d3436"
        r_inf = self._get_inflacion()
        short_m = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

        # Subtitle with context
        sub = (f"Mes Base: {self.MONTHS[self.sel_month-1]} {self.sel_year} — "
               f"${ing_res:,.0f} Ingresos · ${tot_g:,.0f} Egresos · "
               f"Cuotas por Linea de Tiempo")
        self._title("📈  Proyeccion Financiera", sub)

        # Horizon selector
        if not hasattr(self, '_proj_horizon'): self._proj_horizon = 7  # default 6 months (+1)
        horizon = self._proj_horizon
        xlbls, ing_vals, gasto_vals = self._proyeccion_data(horizon)
        x = np.arange(len(xlbls))
        break_month = next((i for i in range(len(gasto_vals)) if gasto_vals[i] > ing_vals[i]), None)
        pct_half = 0
        half_idx = min(horizon // 2, len(gasto_vals)-1)
        if gasto_vals[0] > 0:
            pct_half = (gasto_vals[half_idx] - gasto_vals[0]) / gasto_vals[0] * 100

        # ========== MAIN 2-COLUMN LAYOUT ==========
        main = ctk.CTkFrame(self.cf, fg_color="transparent")
        main.grid(row=2, column=0, sticky="nsew", pady=(10,0))
        main.grid_columnconfigure(0, weight=7)
        main.grid_columnconfigure(1, weight=3)

        # ==================== LEFT COLUMN ====================
        left = ctk.CTkFrame(main, fg_color="transparent")
        left.grid(row=0, column=0, sticky="nsew", padx=(0,10))
        left.grid_columnconfigure(0, weight=1)

        # KPI cards
        kpi_row = ctk.CTkFrame(left, fg_color="transparent")
        kpi_row.grid(row=0, column=0, sticky="ew", pady=(0,15))
        for i in range(3): kpi_row.grid_columnconfigure(i, weight=1)
        last_lbl = xlbls[-1].replace(chr(10), " ") if xlbls else ""
        gasto_last = gasto_vals[-1] if gasto_vals else 0
        bal_last = (ing_vals[-1] - gasto_last) if ing_vals else 0
        # Liquidez acumulada
        liq_acum = sum(i - g for i, g in zip(ing_vals, gasto_vals))
        self._card(kpi_row, 0, 0, f"Ingresos en {last_lbl}", f"${ing_vals[-1]:,.0f}" if ing_vals else "$0",
                   icon="📈", color="#00b894")
        self._card(kpi_row, 0, 1, f"Egresos en {last_lbl}", f"${gasto_last:,.0f}",
                   icon="📉", color="#e94560")
        self._card(kpi_row, 0, 2, "Liquidez Acumulada Total", f"${liq_acum:,.0f}",
                   icon="💰", color="#00b894" if liq_acum >= 0 else "#e17055")

        # Alert bar
        if break_month is not None:
            yr_b = self.sel_year + (self.sel_month + break_month - 1) // 12
            mo_b = (self.sel_month + break_month - 1) % 12 + 1
            alert_txt = f"⚠️  ALERTA: Punto de quiebre en {short_m[mo_b-1]} {yr_b} (mes +{break_month})"
            alert_clr = "#e94560"
        else:
            alert_txt = "✅  Tus ingresos cubren los gastos proyectados en el horizonte seleccionado"
            alert_clr = "#00b894"
        ab = ctk.CTkFrame(left, fg_color=alert_clr, corner_radius=8)
        ab.grid(row=1, column=0, sticky="ew", pady=(0,15))
        ctk.CTkLabel(ab, text=alert_txt,
                     font=ctk.CTkFont(size=13, weight="bold"), text_color="white").pack(padx=20, pady=10)

        # Chart frame
        chart_title = f"Proyeccion a {horizon-1} meses"
        chart_sub = "Egresos fijos con inflacion compuesta · Cuotas y recurrentes sin inflacion"
        cf_chart = ctk.CTkFrame(left, corner_radius=12)
        cf_chart.grid(row=2, column=0, sticky="ew", pady=(0,15))
        cf_chart.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(cf_chart, text=chart_title,
                     font=ctk.CTkFont(size=15, weight="bold")).grid(
            row=0, column=0, padx=20, pady=(15,2), sticky="w")
        ctk.CTkLabel(cf_chart, text=chart_sub,
                     font=ctk.CTkFont(size=11), text_color="gray").grid(
            row=1, column=0, padx=20, pady=(0,8), sticky="w")

        fig = Figure(figsize=(9, 4), facecolor=bg)
        ax = fig.add_subplot(111)
        self._style_ax(ax, bg, tc)
        # Grouped bars: Egresos + Ingresos + Resto
        w = 0.25
        resto_vals = [max(i - g, 0) for i, g in zip(ing_vals, gasto_vals)]
        ax.bar(x - w, gasto_vals, width=w, color="#e94560", alpha=0.85, label="Egresos", zorder=2)
        ax.bar(x,     ing_vals,   width=w, color="#00b894", alpha=0.85, label="Ingresos", zorder=2)
        ax.bar(x + w, resto_vals, width=w, color="#a29bfe", alpha=0.7,  label="Resto", zorder=2)
        # R7: Danger zone — shade area where egresos > ingresos
        ing_arr = np.array(ing_vals, dtype=float)
        gas_arr = np.array(gasto_vals, dtype=float)
        ax.fill_between(x, ing_arr, gas_arr, where=(gas_arr > ing_arr),
                         color="#e94560", alpha=0.08, interpolate=True, zorder=1)
        ax.set_xticks(x)
        ax.set_xticklabels(xlbls, fontsize=7, color=tc)
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"${v/1e6:.1f}M" if abs(v) >= 1e6 else f"${v:,.0f}"))
        ax.legend(facecolor=bg, edgecolor="gray", labelcolor=tc, fontsize=9, loc="upper left")
        if break_month is not None:
            ax.axvline(x=break_month, color="#fdcb6e", lw=2, linestyle="--", alpha=0.9)
        fig.tight_layout()
        c1 = FigureCanvasTkAgg(fig, master=cf_chart); c1.draw()
        c1.get_tk_widget().grid(row=2, column=0, padx=15, pady=(0,15), sticky="ew")

        # TABLE
        tbl_f = ctk.CTkFrame(left, corner_radius=12)
        tbl_f.grid(row=3, column=0, sticky="ew")
        tbl_f.grid_columnconfigure(0, weight=1)
        hdrs = ["Mes", "Ingresos", "Egresos", "Resto"]
        hr = ctk.CTkFrame(tbl_f, fg_color=("gray80","gray25"), corner_radius=6)
        hr.grid(row=0, column=0, padx=10, pady=(10,4), sticky="ew")
        for ci, h in enumerate(hdrs):
            ctk.CTkLabel(hr, text=h, font=ctk.CTkFont(size=12, weight="bold"),
                         width=175).grid(row=0, column=ci, padx=5, pady=8)
        for ri, (lbl, ing, gas) in enumerate(zip(xlbls, ing_vals, gasto_vals)):
            bal = ing - gas
            is_brk = (ri == break_month)
            if is_brk:
                rbg = ("#ffe0e0","#3d1010")
            elif ri % 2 == 0:
                rbg = ("gray92","gray20")
            else:
                rbg = ("gray88","gray24")
            r = ctk.CTkFrame(tbl_f, fg_color=rbg, corner_radius=6)
            r.grid(row=ri+1, column=0, padx=10, pady=1, sticky="ew")
            lbl2 = lbl.replace(chr(10), " ")
            ctk.CTkLabel(r, text=lbl2, font=ctk.CTkFont(size=12,
                         weight="bold" if is_brk else "normal"),
                         width=175).grid(row=0,column=0,padx=8,pady=6)
            ctk.CTkLabel(r, text=f"${ing:,.0f}", text_color="#00b894",
                         width=175).grid(row=0, column=1, padx=5)
            ctk.CTkLabel(r, text=f"${gas:,.0f}", text_color="#e94560",
                         width=175).grid(row=0, column=2, padx=5)
            ctk.CTkLabel(r, text=f"${bal:,.0f}", text_color="#00b894" if bal>=0 else "#e17055",
                         font=ctk.CTkFont(weight="bold"), width=175).grid(row=0, column=3, padx=5)
        ctk.CTkLabel(tbl_f, text="").grid(row=len(xlbls)+1, pady=5)

        # ==================== RIGHT COLUMN: PARAMETERS ====================
        right = ctk.CTkFrame(main, corner_radius=12)
        right.grid(row=0, column=1, sticky="nsew")
        right.grid_columnconfigure(0, weight=1)

        # Horizon selector
        ctk.CTkLabel(right, text="Horizonte de Proyeccion",
                     font=ctk.CTkFont(size=12, weight="bold")).grid(
            row=0, column=0, padx=15, pady=(15,5), sticky="w")
        hz_f = ctk.CTkFrame(right, fg_color="transparent")
        hz_f.grid(row=1, column=0, padx=15, pady=(0,10), sticky="ew")
        for ci in range(3): hz_f.grid_columnconfigure(ci, weight=1)
        def _set_horizon(val):
            self._proj_horizon = val
            self._nav("proyeccion")
        for hi, (h_label, h_val) in enumerate([("6 meses", 7), ("12 meses", 13), ("24 meses", 25)]):
            is_sel = (horizon == h_val)
            ctk.CTkButton(hz_f, text=h_label, height=30, corner_radius=8,
                          fg_color="#0984e3" if is_sel else ("gray80","gray25"),
                          hover_color="#0773c4" if is_sel else ("gray70","gray30"),
                          text_color="white" if is_sel else ("gray20","gray90"),
                          font=ctk.CTkFont(size=11),
                          command=lambda v=h_val: _set_horizon(v)).grid(
                row=0, column=hi, padx=3, sticky="ew")

        ctk.CTkFrame(right, height=1, fg_color="gray40").grid(
            row=2, column=0, padx=12, pady=8, sticky="ew")

        # Mes Base breakdown
        ctk.CTkLabel(right, text="📅  Mes Base (Mes 0 → Actual)",
                     font=ctk.CTkFont(size=12, weight="bold")).grid(
            row=3, column=0, padx=15, pady=(5,8), sticky="w")
        base_items = [
            ("Ingresos",          ing_res, "#00b894"),
            ("Egresos fijos",     fij,     "#e94560"),
            ("Cuotas activas",    cuo,     "#fdcb6e"),
            ("Gastos recurrentes",men,     "#0984e3"),
        ]
        for bi, (b_label, b_val, b_clr) in enumerate(base_items):
            bf = ctk.CTkFrame(right, corner_radius=8, fg_color=("gray88","gray18"))
            bf.grid(row=4+bi, column=0, padx=10, pady=3, sticky="ew")
            ctk.CTkFrame(bf, width=4, corner_radius=2, fg_color=b_clr).pack(
                side="left", fill="y", padx=(6,0), pady=6)
            btf = ctk.CTkFrame(bf, fg_color="transparent")
            btf.pack(side="left", fill="both", expand=True, padx=8, pady=6)
            ctk.CTkLabel(btf, text=b_label, font=ctk.CTkFont(size=10),
                         text_color=b_clr).pack(anchor="w")
            ctk.CTkLabel(btf, text=f"$ {b_val:,.0f}", font=ctk.CTkFont(size=16, weight="bold"),
                         text_color=b_clr).pack(anchor="w")

        # Total egresos
        tf = ctk.CTkFrame(right, fg_color="transparent")
        tf.grid(row=8, column=0, padx=15, pady=(8,5), sticky="ew")
        ctk.CTkLabel(tf, text="Total egresos", font=ctk.CTkFont(size=11),
                     text_color="gray").pack(side="left")
        ctk.CTkLabel(tf, text=f"$ {tot_g:,.0f}", font=ctk.CTkFont(size=13, weight="bold"),
                     text_color="#e94560").pack(side="right")

        ctk.CTkFrame(right, height=1, fg_color="gray40").grid(
            row=9, column=0, padx=12, pady=8, sticky="ew")

        # Inline inflation parameter
        ctk.CTkLabel(right, text="Parametros de Proyeccion",
                     font=ctk.CTkFont(size=12, weight="bold")).grid(
            row=10, column=0, padx=15, pady=(5,5), sticky="w")
        # Inflation input
        inf_f = ctk.CTkFrame(right, fg_color="transparent")
        inf_f.grid(row=11, column=0, padx=15, pady=(0,5), sticky="ew")
        ctk.CTkLabel(inf_f, text="Inflacion Mensual Estimada (%)",
                     font=ctk.CTkFont(size=11), text_color="gray").pack(anchor="w")
        inf_entry_row = ctk.CTkFrame(inf_f, fg_color="transparent")
        inf_entry_row.pack(fill="x", pady=(3,0))
        self._proj_inf_entry = ctk.CTkEntry(inf_entry_row, placeholder_text="Ej: 4.2", width=120, height=30)
        self._proj_inf_entry.insert(0, str(r_inf))
        self._proj_inf_entry.pack(side="left")
        ctk.CTkLabel(inf_entry_row, text="%", font=ctk.CTkFont(size=12),
                     text_color="gray").pack(side="left", padx=5)

        ctk.CTkLabel(right, text="Afecta solo egresos fijos (cuotas\ny recurrentes no se inflan)",
                     font=ctk.CTkFont(size=10), text_color="gray",
                     justify="left").grid(row=12, column=0, padx=15, pady=(0,8), sticky="w")

        def _apply_proj_params():
            try:
                val = float(self._proj_inf_entry.get().replace(",","."))
                if val < 0 or val > 100: raise ValueError
            except ValueError:
                self._toast("Valor de inflacion invalido (0-100)", "#e94560")
                return
            with get_conn() as c:
                c.execute("INSERT INTO historial_inflacion(mes,anio,valor) VALUES(?,?,?) "
                          "ON CONFLICT(mes,anio) DO UPDATE SET valor=excluded.valor",
                          (self.sel_month, self.sel_year, val))
            self.cfg["inflacion"] = val
            save_config(self.cfg)
            self._toast(f"Inflacion actualizada a {val}%")
            self._nav("proyeccion")

        ctk.CTkButton(right, text="Actualizar Proyeccion", fg_color="#0984e3",
                      hover_color="#0773c4", width=180, height=32, corner_radius=8,
                      command=_apply_proj_params).grid(
            row=13, column=0, padx=15, pady=(5,10))

        # R7: Mes más costoso card
        if gasto_vals:
            max_idx = max(range(len(gasto_vals)), key=lambda i: gasto_vals[i])
            max_lbl = xlbls[max_idx].replace(chr(10), " ") if max_idx < len(xlbls) else "?"
            max_val = gasto_vals[max_idx]
            ctk.CTkFrame(right, height=1, fg_color="gray40").grid(
                row=14, column=0, padx=12, pady=4, sticky="ew")
            mc_f = ctk.CTkFrame(right, corner_radius=8, fg_color=("gray88","gray18"))
            mc_f.grid(row=15, column=0, padx=10, pady=(4,15), sticky="ew")
            ctk.CTkFrame(mc_f, width=4, corner_radius=2, fg_color="#e94560").pack(
                side="left", fill="y", padx=(6,0), pady=6)
            mc_t = ctk.CTkFrame(mc_f, fg_color="transparent")
            mc_t.pack(side="left", fill="both", expand=True, padx=8, pady=6)
            ctk.CTkLabel(mc_t, text="🔥 Mes Más Costoso",
                         font=ctk.CTkFont(size=10, weight="bold"),
                         text_color="#e94560").pack(anchor="w")
            ctk.CTkLabel(mc_t, text=max_lbl,
                         font=ctk.CTkFont(size=12)).pack(anchor="w")
            ctk.CTkLabel(mc_t, text=f"${max_val:,.0f}",
                         font=ctk.CTkFont(size=16, weight="bold"),
                         text_color="#e94560").pack(anchor="w")


    def _page_historial(self):
        self._title("Historial Financiero")
        dark = ctk.get_appearance_mode().lower() == "dark"
        bg   = "#1e1e2e" if dark else "#f5f5f5"
        tc   = "#eaeaea" if dark else "#2d3436"

        # Recolectar todos los meses con datos
        with get_conn() as c:
            ing_rows = c.execute(
                "SELECT mes, anio, sueldo+otros FROM ingresos ORDER BY anio, mes").fetchall()
            men_rows = c.execute(
                "SELECT mes, anio, SUM(monto) FROM gastos_mensuales "
                "GROUP BY anio, mes ORDER BY anio, mes").fetchall()
            inf_rows = self._get_inflacion_historial()

        cuotas    = self._cuotas()

        # Construir diccionarios por (anio, mes)
        ing_map = {(r[1], r[0]): r[2] for r in ing_rows}
        men_map = {(r[1], r[0]): r[2] for r in men_rows}
        inf_map = {(r[1], r[0]): r[2] for r in inf_rows}

        # Union de todos los periodos con algun dato
        all_periods = sorted(set(ing_map) | set(men_map) | set(inf_map))

        if len(all_periods) < 2:
            no_data = ctk.CTkFrame(self.cf, corner_radius=12)
            no_data.grid(row=1, column=0, sticky="ew", pady=(0,20))
            ctk.CTkLabel(no_data, text=(
"Necesitas datos de al menos 2 meses para ver el historial. Carga ingresos y gastos en distintos meses y vuelve aqui."
            ), font=ctk.CTkFont(size=14), text_color="gray", justify="center").pack(padx=40, pady=40)
            return

        short_m = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
        xlbls, y_ing, y_gas, y_bal, y_inf = [], [], [], [], []

        for (yr, mo) in all_periods:
            ing  = ing_map.get((yr, mo), 0)
            men  = men_map.get((yr, mo), 0)
            with get_conn() as _ch:
                fij_rows_h = _ch.execute("SELECT monto,moneda FROM gastos_fijos WHERE activo=1 AND mes=? AND anio=?", (mo, yr)).fetchall()
            fij_h = sum(self._pesificar(r[0], r[1] if len(r)>1 else "ARS") for r in fij_rows_h)
            cuo  = sum(self._cuota_en_mes(r[2],r[3],r[4],r[5],r[6],yr,mo) for r in cuotas)
            gas  = fij_h + men + cuo
            inf  = inf_map.get((yr, mo), None)
            xlbls.append(f"{short_m[mo-1]}" + chr(10) + str(yr))
            y_ing.append(ing)
            y_gas.append(gas)
            y_bal.append(ing - gas)
            y_inf.append(inf)

        x = list(range(len(all_periods)))

        # KPI resumen historico
        kpi_f = ctk.CTkFrame(self.cf, corner_radius=12)
        kpi_f.grid(row=1, column=0, sticky="ew", pady=(0,20))
        kpi_f.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(kpi_f, text=f"Resumen Historico ({len(all_periods)} meses registrados)",
                     font=ctk.CTkFont(size=15, weight="bold")).grid(
            row=0, column=0, columnspan=4, padx=20, pady=(15,10), sticky="w")
        cf_k = ctk.CTkFrame(kpi_f, fg_color="transparent")
        cf_k.grid(row=1, column=0, sticky="ew", padx=10, pady=(0,15))
        for i in range(4): cf_k.grid_columnconfigure(i, weight=1)
        avg_ing = sum(y_ing)/len(y_ing) if y_ing else 0
        avg_gas = sum(y_gas)/len(y_gas) if y_gas else 0
        avg_bal = sum(y_bal)/len(y_bal) if y_bal else 0
        inf_vals_only = [v for v in y_inf if v is not None]
        avg_inf = sum(inf_vals_only)/len(inf_vals_only) if inf_vals_only else 0
        for col, (title, value, sub, clr) in enumerate([
            ("Ingreso Promedio",  f"${avg_ing:,.0f}", "promedio mensual", "#00b894"),
            ("Gasto Promedio",    f"${avg_gas:,.0f}", "promedio mensual", "#e94560"),
            ("Balance Promedio",  f"${avg_bal:,.0f}", "promedio mensual", "#00b894" if avg_bal>=0 else "#e17055"),
            ("Inflacion Promedio",f"{avg_inf:.2f}%",  "promedio registrado", "#fdcb6e"),
        ]):
            f = ctk.CTkFrame(cf_k, corner_radius=10, fg_color=("gray88","gray18"))
            f.grid(row=0, column=col, padx=8, sticky="nsew")
            ctk.CTkLabel(f, text=title, font=ctk.CTkFont(size=12), text_color="gray").pack(padx=15, pady=(12,2), anchor="w")
            ctk.CTkLabel(f, text=value, font=ctk.CTkFont(size=22, weight="bold"), text_color=clr).pack(padx=15, anchor="w")
            ctk.CTkLabel(f, text=sub, font=ctk.CTkFont(size=10), text_color="gray").pack(padx=15, pady=(0,12), anchor="w")

        # GRAFICO 1: Ingresos vs Gastos historicos
        f1 = ctk.CTkFrame(self.cf, corner_radius=12)
        f1.grid(row=2, column=0, sticky="ew", pady=(0,20))
        f1.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(f1, text="Evolucion de Ingresos, Gastos y Balance",
                     font=ctk.CTkFont(size=15, weight="bold")).grid(
            row=0, column=0, padx=20, pady=(15,5), sticky="w")
        fig1 = Figure(figsize=(11, 4), facecolor=bg)
        ax1  = fig1.add_subplot(111)
        ax1.set_facecolor(bg)
        ax1.plot(x, y_ing, color="#00b894", lw=2.5, marker="o", ms=5, label="Ingresos")
        ax1.plot(x, y_gas, color="#e94560", lw=2.5, marker="s", ms=5, label="Gastos Totales")
        ax1.fill_between(x, y_ing, y_gas,
                         where=[i >= g for i, g in zip(y_ing, y_gas)],
                         alpha=0.12, color="#00b894")
        ax1.fill_between(x, y_ing, y_gas,
                         where=[i < g for i, g in zip(y_ing, y_gas)],
                         alpha=0.18, color="#e94560")
        ax2b = ax1.twinx()
        ax2b.bar(x, y_bal, alpha=0.25, color=[
            "#00b894" if b >= 0 else "#e17055" for b in y_bal], width=0.4, label="Balance")
        ax2b.axhline(0, color="gray", lw=0.8, linestyle="--")
        ax2b.set_ylabel("Balance ($)", color="gray", fontsize=9)
        ax2b.tick_params(colors="gray")
        ax2b.yaxis.set_tick_params(labelcolor="gray")
        import matplotlib.ticker as mticker
        fmt = mticker.FuncFormatter(lambda v, _: f"${v:,.0f}")
        ax1.yaxis.set_major_formatter(fmt)
        ax2b.yaxis.set_major_formatter(fmt)
        ax1.set_xticks(x); ax1.set_xticklabels(xlbls, fontsize=8, color=tc)
        ax1.tick_params(colors=tc); ax1.yaxis.set_tick_params(labelcolor=tc)
        for sp in ax1.spines.values(): sp.set_color("gray")
        ax1.set_ylabel("$ Pesos", color=tc, fontsize=10)
        ax1.set_title("Historial mensual de ingresos y gastos", color=tc, fontsize=11)
        lines1 = ax1.get_lines() + ax2b.get_lines()
        labels1 = [l.get_label() for l in lines1 if not l.get_label().startswith("_")]
        ax1.legend(lines1[:2], labels1[:2], facecolor=bg, edgecolor="gray", labelcolor=tc, fontsize=9)
        fig1.tight_layout()
        c1 = FigureCanvasTkAgg(fig1, master=f1); c1.draw()
        c1.get_tk_widget().grid(row=1, column=0, padx=15, pady=(0,15), sticky="ew")

        # GRAFICO 2: Inflacion historica (solo si hay datos)
        if inf_vals_only:
            f2 = ctk.CTkFrame(self.cf, corner_radius=12)
            f2.grid(row=3, column=0, sticky="ew", pady=(0,20))
            f2.grid_columnconfigure(0, weight=1)
            ctk.CTkLabel(f2, text="Historial de Inflacion Mensual Registrada",
                         font=ctk.CTkFont(size=15, weight="bold")).grid(
                row=0, column=0, padx=20, pady=(15,5), sticky="w")
            fig2 = Figure(figsize=(11, 2.8), facecolor=bg)
            ax2  = fig2.add_subplot(111)
            ax2.set_facecolor(bg)
            xi = [i for i, v in enumerate(y_inf) if v is not None]
            yi = [v for v in y_inf if v is not None]
            xi_lbls = [xlbls[i] for i in xi]
            ax2.bar(xi, yi, color="#fdcb6e", alpha=0.75, width=0.5)
            ax2.plot(xi, yi, color="#e94560", lw=1.8, marker="o", ms=4)
            ax2.axhline(avg_inf, color="gray", lw=1.2, linestyle="--", alpha=0.7)
            ax2.text(xi[-1]+0.1, avg_inf, f"Prom: {avg_inf:.2f}%",
                     color="gray", fontsize=8, va="center")
            ax2.set_xticks(xi); ax2.set_xticklabels(xi_lbls, fontsize=8, color=tc)
            ax2.tick_params(colors=tc); ax2.yaxis.set_tick_params(labelcolor=tc)
            for sp in ax2.spines.values(): sp.set_color("gray")
            ax2.set_ylabel("% mensual", color=tc, fontsize=10)
            ax2.set_title("Inflacion mensual registrada por periodo", color=tc, fontsize=11)
            fig2.tight_layout()
            c2 = FigureCanvasTkAgg(fig2, master=f2); c2.draw()
            c2.get_tk_widget().grid(row=1, column=0, padx=15, pady=(0,15), sticky="ew")

        # TABLA HISTORICA
        tbl_row = 4 if inf_vals_only else 3
        tbl = ctk.CTkFrame(self.cf, corner_radius=12)
        tbl.grid(row=tbl_row, column=0, sticky="ew")
        tbl.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(tbl, text="Tabla Historica Mensual",
                     font=ctk.CTkFont(size=15, weight="bold")).grid(
            row=0, column=0, padx=20, pady=(15,5), sticky="w")
        hdrs = ["Periodo", "Ingresos", "Gastos", "Balance", "Inflacion"]
        hr = ctk.CTkFrame(tbl, fg_color=("gray80","gray25"), corner_radius=6)
        hr.grid(row=1, column=0, padx=10, pady=(0,4), sticky="ew")
        for ci, h in enumerate(hdrs):
            ctk.CTkLabel(hr, text=h, font=ctk.CTkFont(size=12, weight="bold"),
                         width=185).grid(row=0, column=ci, padx=5, pady=8)
        for ri, ((yr, mo), ing, gas, bal, inf) in enumerate(
                zip(all_periods, y_ing, y_gas, y_bal, y_inf)):
            r = ctk.CTkFrame(tbl, fg_color=("gray90","gray20"), corner_radius=6)
            r.grid(row=ri+2, column=0, padx=10, pady=1, sticky="ew")
            ctk.CTkLabel(r, text=f"{short_m[mo-1]} {yr}",
                         font=ctk.CTkFont(size=12, weight="bold"), width=185).grid(row=0,column=0,padx=8,pady=6)
            ctk.CTkLabel(r, text=f"${ing:,.0f}", width=185).grid(row=0, column=1, padx=5)
            ctk.CTkLabel(r, text=f"${gas:,.0f}", width=185).grid(row=0, column=2, padx=5)
            ctk.CTkLabel(r, text=f"${bal:,.0f}",
                         text_color="#00b894" if bal >= 0 else "#e17055",
                         font=ctk.CTkFont(weight="bold"), width=185).grid(row=0, column=3, padx=5)
            inf_txt = f"{inf:.2f}%" if inf is not None else "-"
            ctk.CTkLabel(r, text=inf_txt, text_color="#fdcb6e" if inf else "gray",
                         width=185).grid(row=0, column=4, padx=5)
        ctk.CTkLabel(tbl, text="").grid(row=len(all_periods)+3, pady=5)

    def _page_ahorro(self):
        self._title("🏦  Metas de Ahorro", "Gestioná tus objetivos de ahorro y seguí tu progreso")
        dark = ctk.get_appearance_mode().lower() == "dark"
        # --- New Meta Form ---
        frm = ctk.CTkFrame(self.cf, corner_radius=12)
        frm.grid(row=1, column=0, sticky="ew", pady=(0,20))
        ctk.CTkLabel(frm, text="+ Nueva Meta de Ahorro",
                     font=ctk.CTkFont(size=15, weight="bold")).grid(
            row=0, column=0, columnspan=6, padx=20, pady=(15,10), sticky="w")
        self._meta_entries = {}
        for i, (lbl, ph, w) in enumerate([
            ("Nombre:", "Ej: Vacaciones", 180),
            ("Objetivo ($):", "Ej: 500000", 120),
            ("Fecha Limite:", "YYYY-MM-DD", 120),
            ("Prioridad (1-100):", "50", 80),
        ]):
            ctk.CTkLabel(frm, text=lbl, font=ctk.CTkFont(size=12)).grid(
                row=1, column=i*2, padx=(20 if i==0 else 5, 5), pady=8, sticky="w")
            e = ctk.CTkEntry(frm, placeholder_text=ph, width=w)
            e.grid(row=1, column=i*2+1, padx=(0,10), pady=8, sticky="w")
            self._meta_entries[lbl] = e
        def _save_meta():
            n = self._meta_entries["Nombre:"].get().strip()
            if not n: self._toast("Ingrese nombre de la meta", "#e94560"); return
            try:
                obj = float(self._meta_entries["Objetivo ($):"].get().replace(",",".")); assert obj > 0
            except Exception: self._toast("Objetivo invalido", "#e94560"); return
            fl = self._meta_entries["Fecha Limite:"].get().strip() or None
            try:
                prio = int(self._meta_entries["Prioridad (1-100):"].get() or 50)
                prio = max(1, min(100, prio))
            except ValueError: prio = 50
            with get_conn() as c:
                c.execute("INSERT INTO metas_ahorro(nombre,objetivo,fecha_limite,prioridad) VALUES(?,?,?,?)",
                          (n, obj, fl, prio))
            self._toast(f"Meta '{n}' creada")
            self._page_ahorro()
        ctk.CTkButton(frm, text="Crear Meta", fg_color="#00b894", hover_color="#00a381",
                       command=_save_meta, width=160, corner_radius=8).grid(
            row=2, column=0, columnspan=8, padx=20, pady=(5,15))

        # --- Active Metas ---
        with get_conn() as c:
            metas = c.execute(
                "SELECT id, nombre, objetivo, acumulado, fecha_limite, prioridad "
                "FROM metas_ahorro WHERE activa=1 ORDER BY prioridad DESC").fetchall()
        if not metas:
            ef = ctk.CTkFrame(self.cf, corner_radius=12)
            ef.grid(row=2, column=0, sticky="ew")
            ef_inner = ctk.CTkFrame(ef, fg_color="transparent")
            ef_inner.pack(pady=40)
            ctk.CTkLabel(ef_inner, text="🎯", font=ctk.CTkFont(size=40)).pack()
            ctk.CTkLabel(ef_inner, text="Sin metas de ahorro",
                         font=ctk.CTkFont(size=16, weight="bold"), text_color="gray").pack(pady=(8,4))
            ctk.CTkLabel(ef_inner, text="Creá tu primera meta arriba para empezar a ahorrar",
                         font=ctk.CTkFont(size=12), text_color="gray").pack()
            return

        for mi, (mid, nombre, objetivo, acumulado, fecha_lim, prioridad) in enumerate(metas):
            pct = (acumulado / objetivo * 100) if objetivo > 0 else 0
            # Risk badge
            if pct >= 100:
                badge_txt, badge_clr = "✅ Completada", "#00b894"
            elif pct >= 60:
                badge_txt, badge_clr = "🟢 En camino", "#00b894"
            elif pct >= 30:
                badge_txt, badge_clr = "🟡 Progresando", "#fdcb6e"
            elif pct > 0:
                badge_txt, badge_clr = "🟠 Inicial", "#e17055"
            else:
                badge_txt, badge_clr = "🔴 Sin aportes", "#e94560"
            # Priority badge
            if prioridad >= 80:
                prio_txt = "🔥 Alta"
            elif prioridad >= 40:
                prio_txt = "📌 Media"
            else:
                prio_txt = "📎 Baja"

            card = ctk.CTkFrame(self.cf, corner_radius=12)
            card.grid(row=mi+2, column=0, sticky="ew", pady=(0,12))
            card.grid_columnconfigure(0, weight=1)
            # Accent bar
            ctk.CTkFrame(card, height=4, corner_radius=2, fg_color=badge_clr).grid(
                row=0, column=0, columnspan=3, sticky="ew")
            # Header
            hdr = ctk.CTkFrame(card, fg_color="transparent")
            hdr.grid(row=1, column=0, sticky="ew", padx=15, pady=(10,5))
            ctk.CTkLabel(hdr, text=nombre, font=ctk.CTkFont(size=16, weight="bold")).pack(
                side="left")
            ctk.CTkLabel(hdr, text=f"{prio_txt}  •  {badge_txt}",
                         font=ctk.CTkFont(size=11), text_color=badge_clr).pack(side="right")
            # Progress
            prog_f = ctk.CTkFrame(card, fg_color="transparent")
            prog_f.grid(row=2, column=0, sticky="ew", padx=15, pady=(0,5))
            pb = ctk.CTkProgressBar(prog_f, width=400, height=16, progress_color=badge_clr,
                                     corner_radius=8)
            pb.pack(side="left", fill="x", expand=True, padx=(0,10))
            pb.set(min(pct / 100, 1.0))
            ctk.CTkLabel(prog_f, text=f"{pct:.1f}%", font=ctk.CTkFont(size=13, weight="bold"),
                         text_color=badge_clr).pack(side="right")
            # Details row
            det = ctk.CTkFrame(card, fg_color="transparent")
            det.grid(row=3, column=0, sticky="ew", padx=15, pady=(0,8))
            falta = max(objetivo - acumulado, 0)
            for label, val, clr in [
                ("Acumulado", f"${acumulado:,.0f}", "#00b894"),
                ("Objetivo", f"${objetivo:,.0f}", "#0984e3"),
                ("Falta", f"${falta:,.0f}", "#e94560" if falta > 0 else "#00b894"),
            ]:
                df = ctk.CTkFrame(det, fg_color="transparent")
                df.pack(side="left", expand=True)
                ctk.CTkLabel(df, text=label, font=ctk.CTkFont(size=10),
                             text_color="gray").pack()
                ctk.CTkLabel(df, text=val, font=ctk.CTkFont(size=14, weight="bold"),
                             text_color=clr).pack()
            if fecha_lim:
                df = ctk.CTkFrame(det, fg_color="transparent")
                df.pack(side="left", expand=True)
                ctk.CTkLabel(df, text="Limite", font=ctk.CTkFont(size=10),
                             text_color="gray").pack()
                ctk.CTkLabel(df, text=fecha_lim, font=ctk.CTkFont(size=12, weight="bold"),
                             text_color="#fdcb6e").pack()

            # Aporte inline
            ap_f = ctk.CTkFrame(card, fg_color=("gray88","gray18"), corner_radius=8)
            ap_f.grid(row=4, column=0, sticky="ew", padx=15, pady=(0,12))
            ctk.CTkLabel(ap_f, text="Registrar aporte:",
                         font=ctk.CTkFont(size=11)).pack(side="left", padx=(10,5), pady=8)
            ap_entry = ctk.CTkEntry(ap_f, placeholder_text="Monto $", width=120, height=28)
            ap_entry.pack(side="left", padx=5, pady=8)
            def _add_aporte(m_id=mid, entry=ap_entry, m_name=nombre):
                try:
                    monto = float(entry.get().replace(",",".")); assert monto > 0
                except Exception:
                    self._toast("Monto invalido", "#e94560"); return
                fecha = datetime.now().strftime("%Y-%m-%d")
                with get_conn() as c:
                    c.execute("INSERT INTO aportes_ahorro(meta_id,monto,fecha) VALUES(?,?,?)",
                              (m_id, monto, fecha))
                    c.execute("UPDATE metas_ahorro SET acumulado = acumulado + ? WHERE id=?",
                              (monto, m_id))
                self._toast(f"${monto:,.0f} aportado a '{m_name}'")
                self._page_ahorro()
            ctk.CTkButton(ap_f, text="Aportar", fg_color="#00b894", hover_color="#00a381",
                           width=80, height=28, corner_radius=6,
                           command=_add_aporte).pack(side="left", padx=5, pady=8)
            # Delete meta
            def _del_meta(m_id=mid):
                with get_conn() as c:
                    c.execute("UPDATE metas_ahorro SET activa=0 WHERE id=?", (m_id,))
                self._toast("Meta eliminada")
                self._page_ahorro()
            ctk.CTkButton(ap_f, text="🗑", fg_color="#e17055", hover_color="#c0392b",
                           width=35, height=28, corner_radius=6,
                           command=_del_meta).pack(side="right", padx=10, pady=8)


if __name__ == "__main__":
    app = App()
    app.mainloop()
