import os
import re
import json

def extract_keys(directory):
    keys = set()
    # Patterns for t('key'), t("key"), i18nKey="key", i18nKey={'key'}
    patterns = [
        re.compile(r"t\(\s*['\"]([^'\"]+)['\"]"),
        re.compile(r"i18nKey\s*=\s*['\"]([^'\"]+)['\"]"),
        re.compile(r"i18nKey\s*=\s*\{\s*['\"]([^'\"]+)['\"]\s*\}")
    ]
    
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(('.ts', '.tsx')):
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        for pattern in patterns:
                            matches = pattern.findall(content)
                            for match in matches:
                                # Filter out suspicious keys:
                                # - Must contain at least one letter
                                # - Must not be just symbols/whitespace
                                # - Filter out template literals (already handled but being explicit)
                                if match and re.search(r'[a-zA-Z]', match) and not match.startswith(('`', '${')):
                                    keys.add(match)
                except Exception as e:
                    print(f"Error reading {path}: {e}")
    return sorted(list(keys))

def humanize(key):
    parts = key.split('.')
    last_part = parts[-1]
    
    # Specific mappings
    mapping = {
        '7d': '7 Days',
        '14d': '14 Days',
        '30d': '30 Days',
        '1m': '1 Month',
        '1y': '1 Year',
        'Q1': 'Q1', 'Q2': 'Q2', 'Q3': 'Q3', 'Q4': 'Q4'
    }
    
    if last_part in mapping:
        if len(parts) > 1 and any(x in parts[-2].lower() for x in ['timeframe', 'timerange']):
             return f"Last {mapping[last_part]}"
        return mapping[last_part]

    # If last part is too generic, prepend previous part
    generics = ['title', 'desc', 'description', 'label', 'placeholder', 'btn', 'tooltip', 'subtitle', 'error', 'success', 'loading']
    display_parts = []
    if last_part.lower() in generics and len(parts) > 1:
        display_parts.append(parts[-2])
    display_parts.append(last_part)
    
    text = " ".join(display_parts)
    # CamelCase to spaces
    text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
    # Snake_case/hyphen-case to spaces
    text = text.replace('_', ' ').replace('-', ' ')
    # Title case
    text = text.title()
    
    # Clean up some common abbreviations
    text = re.sub(r'\bDesc\b', 'Description', text)
    text = re.sub(r'\bBtn\b', 'Button', text)
    text = re.sub(r'\bCfg\b', 'Configuration', text)
    text = re.sub(r'\bMsg\b', 'Message', text)
    text = re.sub(r'\bErr\b', 'Error', text)
    text = re.sub(r'\bInfo\b', 'Information', text)
    text = re.sub(r'\bSts\b', 'Status', text)
    text = re.sub(r'\bQty\b', 'Quantity', text)
    text = re.sub(r'\bRef\b', 'Reference', text)
    
    return text

def inject_keys(json_data, keys):
    added_count = 0
    for key in keys:
        # If the key contains spaces, it's likely a sentence used as a key.
        # Treat it as a flat key and don't split by dots.
        if ' ' in key:
            parts = [key]
        else:
            parts = key.split('.')
            
        current = json_data
        for i, part in enumerate(parts):
            if i == len(parts) - 1:
                if part not in current:
                    current[part] = humanize(key)
                    added_count += 1
            else:
                if part not in current:
                    current[part] = {}
                elif not isinstance(current[part], dict):
                    # Conflict: key exists as a string but we need it as a dict
                    # We'll rename the existing string to "_self" or similar
                    # But for now let's just skip or log
                    print(f"Conflict at {'.'.join(parts[:i+1])}")
                    break
                current = current[part]
    return added_count

def get_keys_and_values(d, prefix=''):
    items = {}
    for k, v in d.items():
        new_key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            items.update(get_keys_and_values(v, new_key))
        else:
            items[new_key] = v
    return items

def clean_and_sort(d):
    new_dict = {}
    for k in sorted(d.keys()):
        v = d[k]
        # Skip empty keys or keys that are just symbols (no alphanumeric)
        if not k.strip() or not re.search(r'[a-zA-Z0-9]', k):
            continue
        
        if isinstance(v, dict):
            cleaned_v = clean_and_sort(v)
            if cleaned_v: # Only keep if not empty
                new_dict[k] = cleaned_v
        else:
            new_dict[k] = v
    return new_dict

def main():
    # Use paths relative to the script location or project root
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src_dir = os.path.join(base_dir, 'src')
    locales_dir = os.path.join(src_dir, 'locales')
    
    print(f"Extracting keys from {src_dir}...")
    all_keys = extract_keys(src_dir)
    print(f"Found {len(all_keys)} unique keys in code.")
    
    all_data = {}
    for lang in ['en', 'es']:
        file_path = os.path.join(locales_dir, f'{lang}.json')
        if not os.path.exists(file_path):
            continue
            
        with open(file_path, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
                all_data[lang] = data
            except Exception as e:
                print(f"Error loading {file_path}: {e}")
                continue
        
        print(f"Injecting keys into {lang}.json...")
        added = inject_keys(data, all_keys)
        print(f"Added {added} new keys to {lang}.json.")
        
        # Clean and sort
        data = clean_and_sort(data)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, sort_keys=True, ensure_ascii=False)
    
    # Generate untranslated report for Spanish
    if 'en' in all_data and 'es' in all_data:
        en_items = get_keys_and_values(all_data['en'])
        es_items = get_keys_and_values(all_data['es'])
        
        untranslated = []
        for key, es_val in es_items.items():
            en_val = en_items.get(key)
            # If Spanish value matches English value, it's likely untranslated
            # Or if Spanish value matches the humanized key
            if es_val == en_val or es_val == humanize(key):
                # Check if it's naturally the same (e.g. "Vult Intel", numbers, or short words like "Email")
                if len(es_val) > 5 and not es_val.replace(' ', '').isalnum():
                     untranslated.append((key, es_val))
                elif es_val == humanize(key) and len(es_val) > 3:
                     untranslated.append((key, es_val))

        if untranslated:
            report_path = os.path.join(os.getcwd(), 'untranslated_es.txt')
            with open(report_path, 'w', encoding='utf-8') as f:
                f.write(f"Potentially untranslated keys in Spanish ({len(untranslated)}):\n")
                for key, val in sorted(untranslated):
                    f.write(f"{key}: {val}\n")
            print(f"Generated untranslated report at {report_path}")
            
    # Generate unused keys report
    if 'en' in all_data:
        en_items = get_keys_and_values(all_data['en'])
        code_keys = set(all_keys)
        unused = []
        for key in en_items.keys():
            # Check if key is in code
            if key not in code_keys:
                # Basic check for dynamic keys: if a prefix matches, it might be dynamic
                # e.g. code has "status", json has "status.active", "status.inactive"
                is_dynamic = False
                for ck in code_keys:
                    if key.startswith(ck + '.'):
                        is_dynamic = True
                        break
                if not is_dynamic:
                    unused.append(key)
        
        if unused:
            unused_path = os.path.join(os.getcwd(), 'unused_keys.txt')
            with open(unused_path, 'w', encoding='utf-8') as f:
                f.write(f"Potentially unused keys in en.json ({len(unused)}):\n")
                f.write("(Warning: Some might be used dynamically in code and missed by regex)\n\n")
                for key in sorted(unused):
                    f.write(f"{key}\n")
            print(f"Generated unused keys report at {unused_path}")
            
    print("Done.")

if __name__ == '__main__':
    main()
