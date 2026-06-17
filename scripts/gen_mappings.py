#!/usr/bin/env python3
"""Generate character mapping files for the plugin from OpenCC data.

Outputs:
  src/data/s2t.json      — simplified → general traditional (4,011 entries)
  src/data/t2s.json      — general traditional → simplified (4,142 entries)
  src/data/s2hk.json     — simplified → Hong Kong traditional
  src/data/s2tw.json     — simplified → Taiwan traditional
  src/data/hk_variants.json — general traditional → HK traditional (63 entries)
  src/data/tw_variants.json — general traditional → TW traditional (38 entries)
"""

import json, os, urllib.request

BASE = "https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary"

def parse_dict(url, single_char=True):
    """Parse OpenCC dictionary. Format: key\tvalue(s) (space-separated)."""
    data = urllib.request.urlopen(url).read().decode('utf-8')
    mapping = {}
    for line in data.split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split('\t')
        if len(parts) >= 2:
            key = parts[0]
            # Take the first value for single-char entries
            values = parts[1].split(' ') if ' ' in parts[1] else [parts[1]]
            if not single_char or (len(key) == 1 and values[0] and len(values[0]) == 1):
                mapping[key] = values[0]
    return mapping

def apply_variants(s2t_map, variant_map):
    """Apply regional variants on top of s2t to produce region-specific s2t map.
    
    For each simplified→traditional entry, if the traditional output has a
    regional variant, replace with the regional form.
    Also add entries for characters that only differ at the variant level.
    """
    result = {}
    for simp, trad in s2t_map.items():
        # If the general traditional has a regional variant, use it
        result[simp] = variant_map.get(trad, trad)
    
    # Also add variant-only entries: for variants that have no direct simplified→
    # mapping, we need the reverse so t2s works correctly too
    for gen, region in variant_map.items():
        # If we can find a simplified char that maps to 'gen', we already handled it
        # Find any simplified that maps to this general form
        for simp, trad in s2t_map.items():
            if trad == gen:
                # Apply variant: this simplified char should now map to region form
                if simp in result:
                    result[simp] = region
                break
    
    return result

def build_t2s_region(s2t_region):
    """Build reverse mapping: region traditional → simplified."""
    t2s = {}
    for simp, trad in s2t_region.items():
        t2s[trad] = simp
    return t2s

def build_hk_tw_bidi(hk_var, tw_var):
    """Build bidirectional HK↔TW mapping where they differ."""
    bidi = {}
    for gen, hk_form in hk_var.items():
        tw_form = tw_var.get(gen, gen)
        if hk_form != tw_form:
            bidi[hk_form] = tw_form
            bidi[tw_form] = hk_form
    return bidi

os.chdir(os.path.dirname(os.path.abspath(__file__)))

print("Downloading STCharacters.txt (simplified → general traditional)...")
s2t_general = parse_dict(f"{BASE}/STCharacters.txt")
print(f"  {len(s2t_general)} entries")

print("Downloading TSCharacters.txt (general traditional → simplified)...")
t2s_general = parse_dict(f"{BASE}/TSCharacters.txt")
print(f"  {len(t2s_general)} entries")

print("Downloading HKVariants.txt (general → HK)...")
hk_variants = parse_dict(f"{BASE}/HKVariants.txt")
print(f"  {len(hk_variants)} entries")

print("Downloading TWVariants.txt (general → TW)...")
tw_variants = parse_dict(f"{BASE}/TWVariants.txt")
print(f"  {len(tw_variants)} entries")

# Build region-specific s2t maps
s2t_hk = apply_variants(s2t_general, hk_variants)
s2t_tw = apply_variants(s2t_general, tw_variants)

# Build reverse maps
t2s_hk = build_t2s_region(s2t_hk)
t2s_tw = build_t2s_region(s2t_tw)

# Build ALL variants map: for each simplified char, collect all traditional forms
s2t_all = {}
t2s_all = {}
for simp, general in s2t_general.items():
    hk = hk_variants.get(general, general)
    tw = tw_variants.get(general, general)
    all_trad = list(dict.fromkeys([general, hk, tw]))  # dedup preserving order
    s2t_all[simp] = all_trad  # list of all traditional forms
    for trad in all_trad:
        t2s_all[trad] = simp  # each trad form maps back to simplified

# Build HK↔TW bidirectional mapping
hk_tw_bidi = build_hk_tw_bidi(hk_variants, tw_variants)

os.makedirs('../src/data', exist_ok=True)

def write_json(name, data):
    path = f'../src/data/{name}'
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    return path

write_json('s2t.json', s2t_general)
write_json('t2s.json', t2s_general)
write_json('s2hk.json', s2t_hk)
write_json('t2hk.json', t2s_hk)
write_json('s2tw.json', s2t_tw)
write_json('t2tw.json', t2s_tw)
write_json('s2all.json', s2t_all)
write_json('hk_variants.json', hk_variants)
write_json('tw_variants.json', tw_variants)
write_json('hk_tw.json', hk_tw_bidi)

print(f"\n{'='*50}")
print(f"Files written:")
print(f"  s2t.json          — {len(s2t_general)} entries (general s→t)")
print(f"  t2s.json          — {len(t2s_general)} entries (general t→s)")
print(f"  s2hk.json         — {len(s2t_hk)} entries (s→HK)")
print(f"  t2hk.json         — {len(t2s_hk)} entries (HK→s)")
print(f"  s2tw.json         — {len(s2t_tw)} entries (s→TW)")
print(f"  t2tw.json         — {len(t2s_tw)} entries (TW→s)")
print(f"  s2all.json        — {len(s2t_all)} entries (s→all variants)")
print(f"  hk_variants.json  — {len(hk_variants)} entries (general→HK diff)")
print(f"  tw_variants.json  — {len(tw_variants)} entries (general→TW diff)")

# Verify samples
print(f"\nSample conversions:")
tests = [
    ('剑', '线', '着', '里', '峰', '群'),
]
for chars in tests:
    for c in chars:
        gen = s2t_general.get(c, '?')
        hk = s2t_hk.get(c, '?')
        tw = s2t_tw.get(c, '?')
        all_v = s2t_all.get(c, ['?'])
        flag = '✦' if (gen == hk == tw) else '⚠ differs'
        print(f"  {c} → gen:{gen} hk:{hk} tw:{tw} all:{all_v} {flag}")
