import re

with open('contracts/impl/LiquidETHV1.sol') as f:
    text = f.read()

lines = text.splitlines()

# Search for arithmetic inside code (exclude doc comments)
in_doc = False
code_arithmetic = []
for idx, line in enumerate(lines):
    clean = line.strip()
    if clean.startswith('/*') or clean.startswith('*'):
        continue
    if '//' in clean:
        clean = clean.split('//')[0].strip()

    # Exclude SafeMath contract definition lines (L25-140)
    if idx + 1 >= 25 and idx + 1 <= 140:
        continue

    # Look for +, -, *, /, ++
    if any(op in clean for op in ['+', '-', '*', '/']):
        # Filter out string/signature lines, imports, requires, domain separator construction
        if not any(k in clean for k in ['import', 'pragma', 'event', 'function', 'string', 'abi.encode', 'keccak256', 'typeHash']):
            code_arithmetic.append((idx + 1, clean))

print("=== Code Arithmetic Locations Outside SafeMath Definition ===")
for line_no, code in code_arithmetic:
    print(f"Line {line_no}: {code}")
