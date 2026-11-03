"""Construye una ROM .3ds sintética (NCSD > NCCH > RomFS) con GARCs al estilo ORAS para probar core.js."""
import struct, sys

def u16(v): return struct.pack('<H', v)
def u32(v): return struct.pack('<I', v)
def u64(v): return struct.pack('<Q', v)
def align(v, a): return (v + a - 1) // a * a

def garc(files, pad=4):
    n = len(files)
    fato = b'OTAF' + u32(0xC + 4*n) + u16(n) + u16(0xFFFF) + b''.join(u32(16*i) for i in range(n))
    body, data, od = b'', b'', 0
    for f in files:
        p = (pad - len(f) % pad) % pad
        body += u32(1) + u32(od) + u32(od+len(f)+p) + u32(len(f))
        data += f + b'\xff'*p
        od += len(f)+p
    fatb = b'BTAF' + u32(0xC+len(body)) + u32(n) + body
    fimb = b'BMIF' + u32(0xC) + u32(len(data))
    dataoff = 0x1C + len(fato) + len(fatb) + len(fimb)
    hdr = b'CRAG' + u32(0x1C) + u16(0xFEFF) + u16(0x0400) + u32(4) + u32(dataoff) + u32(dataoff+len(data)) + u32(max(map(len, files)))
    return hdr + fato + fatb + fimb + data

def text(lines):
    enc = []
    key = 0x7C89
    for s in lines:
        chars = [ord(c) for c in s] + [0]
        if len(chars) % 2: chars.append(0)
        k = key; out = b''
        for c in chars:
            out += u16(c ^ k); k = ((k << 3) | (k >> 13)) & 0xFFFF
        enc.append(out); key = (key + 0x2983) & 0xFFFF
    n = len(lines)
    tbl, data, off = b'', b'', 4 + 8*n
    for e in enc:
        tbl += u32(off) + u16(len(e)//2) + u16(0)
        data += e; off += len(e)
    sec = tbl + data
    sec = u32(len(sec)+4) + sec
    return u16(1) + u16(n) + u32(len(sec)) + u32(0) + u32(0x10) + sec

GAME = sys.argv[2] if len(sys.argv) > 2 else 'oras'
G7 = GAME == 'usum'
# --- contenidos ---
species = ['Huevo', 'Bulbasaur', 'Ivysaur', 'Venusaur', 'Charmander', 'Pikachu', 'Mightyena', 'Wailord']
moves = ['—', 'Destructor', 'Ascuas', 'Placaje', 'Impactrueno', 'Mordisco', 'Surf', 'Hidrobomba', 'Látigo Cepa', 'Gruñido']
items = ['Ninguno', 'Poké Ball', 'Baya Zidra', 'Restos', 'Gengarita']
abilities = ['—', 'Espesura', 'Mar Llamas', 'Electricidad Estática', 'Intimidación', 'Clorofila', 'Pararrayos', 'Velo Agua']
classes = ['Pokémon Trainer', 'Joven', 'Líder de gimnasio', 'Team Magma']
trnames = ['', 'Pedro', 'Petra', 'Magno']
tf = [text(['x'])]*120
tf[14] = text(moves); tf[98] = text(species); tf[114] = text(items); tf[37] = text(abilities)
tf[21] = text(classes); tf[22] = text(trnames); tf[5] = text(['']); tf[18] = text(['Normal'])
textgarc = garc(tf)
moves_en = ['—', 'Pound', 'Ember', 'Tackle', 'Thunder Shock', 'Bite', 'Surf', 'Hydro Pump', 'Vine Whip', 'Growl']
items_en = ['None', 'Poké Ball', 'Sitrus Berry', 'Leftovers', 'Gengarite']
abilities_en = ['—', 'Overgrow', 'Blaze', 'Static', 'Intimidate', 'Chlorophyll', 'Lightning Rod', 'Water Veil']
tfe = list(tf)
tfe[14] = text(moves_en); tfe[114] = text(items_en); tfe[37] = text(abilities_en)
textgarc_en = garc(tfe)

def trd(fmt, cls, num):
    return u16(fmt) + u16(cls) + u16(0x55) + bytes([0, num]) + u16(0)*4 + bytes([7, 0, 0, 0, 0, 10]) + u16(0)
def pk(iv, pid, lvl, sp, form, item=None, mv=None):
    b = bytes([iv, pid]) + u16(lvl) + u16(sp) + u16(form)
    if item is not None: b += u16(item)
    if mv is not None: b += b''.join(u16(m) for m in mv)
    return b
trdata = [trd(0, 0, 0), trd(0, 1, 2), trd(3, 2, 1), trd(2, 3, 1)]
trpoke = [b'', pk(0, 0, 5, 1, 0) + pk(0, 0x10, 6, 4, 0),
          pk(255, 0x31, 20, 5, 0, 3, [4, 3, 0, 0]),
          pk(100, 0x22, 30, 6, 0, 2)]
pers = bytearray(0x50 * 9)
def setp(i, abil, formidx=0, fc=1):
    o = i*0x50; pers[o+0x18:o+0x1B] = bytes(abil); pers[o+0x1C:o+0x1E] = u16(formidx); pers[o+0x20] = fc
setp(1, [1, 1, 5]); setp(4, [2, 2, 2]); setp(5, [3, 3, 6], 8, 2); setp(6, [4, 4, 4]); setp(8, [3, 3, 7])
personal = garc([bytes(pers[i*0x50:(i+1)*0x50]) for i in range(9)] + [bytes(pers)])
def ls(pairs): return b''.join(u16(m)+u16(l) for m, l in pairs) + u32(0xFFFFFFFF)
levelup = garc([ls([])]*9)
levelup_list = [ls([])]*9
levelup_list[1] = ls([(3, 1), (9, 3), (8, 7), (2, 9), (1, 13), (5, 15)])
levelup_list[5] = ls([(4, 1), (9, 1), (3, 5)])
levelup = garc(levelup_list)

fs = {'a/0/3/6': garc(trdata), 'a/0/3/8': garc(trpoke), 'a/1/9/5': personal, 'a/1/9/1': levelup, 'a/0/7/7': textgarc, 'a/0/7/3': textgarc_en}


if G7:
    import zipfile
    def tp7(sp, lvl, nature=0, item=0, mv=(0,0,0,0), ivs=(31,)*6, evs=(0,)*6, shiny=False, b0=0, form=0):
        iv = 0
        for k, v in enumerate(ivs): iv |= v << (5*k)
        if shiny: iv |= 1 << 30
        iv |= 1 << 31  # bit desconocido que debe conservarse
        b = bytes([b0, nature]) + bytes(evs) + u32(iv) + bytes([0, 0x77]) + bytes([lvl, 0x99]) + u16(sp) + bytes([form, 0xAB]) + u16(item) + u16(0xCDEF) + b''.join(u16(m) for m in mv)
        assert len(b) == 0x20; return b
    def trd7(cls, mode, num): return u16(cls) + bytes([mode, num]) + u16(0)*4 + bytes([7, 0, 0, 0, 0, 20]) + b'\x00'*6 + u32(0x12345678)
    def build_g7(species, sp_count, en=False):
        t = [text(['x'])]*130
        t[118] = text(moves_en if en else moves); t[60] = text(species); t[40] = text(items_en if en else items); t[101] = text(abilities_en if en else abilities)
        t[111] = text(['Pokémon Trainer', 'Capitán', 'Kahuna']); t[110] = text(['', 'Liam', 'Kaudan']); t[112] = text(['Normal']*18)
        t[92] = text(['Fuerte', 'Huraña', 'Audaz'] + ['N']*22); t[119] = text([''])
        pers = bytearray(0x54 * sp_count)
        for i in range(sp_count): pers[i*0x54+0x18:i*0x54+0x1B] = bytes([1, 2, 3]); pers[i*0x54+0x20] = 1
        return garc(t), garc([bytes(pers[i*0x54:(i+1)*0x54]) for i in range(sp_count)] + [bytes(pers)])
    textg, persg = build_g7(species, 9)
    textg_en, _ = build_g7(species, 9, True)
    trd_v = [trd7(0,0,0), trd7(1,0,1), trd7(2,1,2)]
    trp_v = [b'', tp7(5, 12, 1, 3, (4,3,0,0), b0=0x21), tp7(6, 30, 2, 0, (5,0,0,0), shiny=True) + tp7(7, 31, 0, 2, (6,7,0,0), ivs=(1,2,3,4,5,6), evs=(252,0,0,252,4,0))]
    fs = {'a/1/0/6': garc(trd_v), 'a/1/0/7': garc(trp_v), 'a/0/1/7': persg, 'a/0/1/3': levelup, 'a/0/3/6': textg, 'a/0/3/2': textg_en}
    # Mod de expansión: más especies, el rival usa una nueva
    sp2 = species + ['Mew', 'Sprigatito', 'Fuecoco', 'Quaxly']
    textm, persm = build_g7(sp2, 13)
    trp_m = list(trp_v); trp_m[1] = tp7(10, 15, 1, 3, (4,3,0,0))
    lv_m = garc(levelup_list + [ls([(3, 1), (9, 1), (8, 7)])]*4)
    zp = sys.argv[1] + '.mod.zip'
    with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
        base = 'Expansion Mod/00040000001B5100/romfs/'
        z.writestr(base + 'a/1/0/7', garc(trp_m)); z.writestr(base + 'a/0/1/7', persm)
        z.writestr(base + 'a/0/3/6', textm); z.writestr(base + 'a/0/1/3', lv_m)
        z.writestr('Expansion Mod/00040000001B5100/exefs/code.bin', b'\0'*64)
        z.writestr('LEEME.txt', 'mod')

# --- RomFS nivel 3 ---
tree = {}
for p in fs:
    parts = p.split('/'); d = tree
    for x in parts[:-1]: d = d.setdefault(x, {})
    d[parts[-1]] = fs[p]
dirs, files_meta = [], []
dir_tbl, file_tbl, filedata = bytearray(), bytearray(), bytearray()
NONE = 0xFFFFFFFF
def name16(s):
    b = s.encode('utf-16-le'); return b + b'\0' * ((4 - len(b) % 4) % 4), len(b)
# assign offsets via BFS
def build(dirnode, parent_off):
    """returns offset of this dir entry; fills tables. Simple recursive layout."""
    pass
entries = []  # (kind, name, node, parent_idx)
def collect(node, name, parent):
    idx = len(entries); entries.append(['d', name, node, parent, None])
    for k, v in sorted(node.items()):
        if isinstance(v, dict): collect(v, k, idx)
    for k, v in sorted(node.items()):
        if not isinstance(v, dict): entries.append(['f', k, v, idx, None])
collect(tree, '', None)
doff = foff = 0
for e in entries:
    nb, nl = name16(e[1])
    if e[0] == 'd': e[4] = doff; doff += 24 + len(nb)
    else: e[4] = foff; foff += 32 + len(nb)
for i, e in enumerate(entries):
    nb, nl = name16(e[1])
    kids_d = [x for x in entries if x[3] == i and x[0] == 'd']
    kids_f = [x for x in entries if x[3] == i and x[0] == 'f']
    sib = [x for x in entries if x[3] == e[3] and x[0] == e[0]] if e[3] is not None else [e]
    j = sib.index(e); nxt = sib[j+1][4] if j+1 < len(sib) else NONE
    par = entries[e[3]][4] if e[3] is not None else 0
    if e[0] == 'd':
        dir_tbl += u32(par) + u32(nxt) + u32(kids_d[0][4] if kids_d else NONE) + u32(kids_f[0][4] if kids_f else NONE) + u32(NONE) + u32(nl) + nb
    else:
        while len(filedata) % 16: filedata.append(0)
        file_tbl += u32(par) + u32(nxt) + u64(len(filedata)) + u64(len(e[2])) + u32(NONE) + u32(nl) + nb
        filedata += e[2]
hdr_len = 0x28
dmo = hdr_len; fmo = dmo + len(dir_tbl); dato = align(fmo + len(file_tbl), 16)
lvl3 = u32(0x28) + u32(dmo) + u32(0) + u32(dmo) + u32(len(dir_tbl)) + u32(fmo) + u32(0) + u32(fmo) + u32(len(file_tbl)) + u32(dato)
lvl3 = bytearray(lvl3 + dir_tbl + file_tbl); lvl3 += b'\0' * (dato - len(lvl3)); lvl3 += filedata
mhs = 0x20
ivfc = b'IVFC' + u32(0x10000) + u32(mhs) + (u64(0)+u64(0x20)+u32(12)+u32(0)) * 2 + u64(0) + u64(len(lvl3)) + u32(12) + u32(0) + u32(0)
ivfc = ivfc.ljust(0x60, b'\0') + b'\0'*mhs
romfs = ivfc.ljust(align(len(ivfc), 0x1000), b'\0') + lvl3
romfs = romfs.ljust(align(len(romfs), 0x200), b'\0')

ncch = bytearray(0x200)
ncch[0x100:0x104] = b'NCCH'
ncch[0x118:0x120] = u64(0x00040000001B5100 if G7 else 0x000400000011C500)
ncch[0x150:0x15A] = b'CTR-P-ECLA'
ncch[0x18F] = 4
ncch[0x1B0:0x1B4] = u32(1); ncch[0x1B4:0x1B8] = u32(len(romfs)//0x200)
ncch = bytes(ncch) + romfs
rom = bytearray(0x4000)
rom[0x100:0x104] = b'NCSD'
rom[0x120:0x124] = u32(0x4000 // 0x200); rom[0x124:0x128] = u32(len(ncch)//0x200)
rom = bytes(rom) + ncch
open(sys.argv[1], 'wb').write(rom)
print('ok', len(rom))
