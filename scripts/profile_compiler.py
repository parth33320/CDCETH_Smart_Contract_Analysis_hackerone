import re

with open('contracts/impl/LiquidETHV1.sol') as f:
    text = f.read()

lines = text.splitlines()

print("=== Module 2: Arithmetic Handling & Risk Profiling ===")

# SafeMath usage vs Standard math operators
standard_math_locations = []
safemath_locations = []

for idx, line in enumerate(lines):
    clean = line.split('//')[0]
    if not clean.strip():
        continue

    # Check for increment operator ++ or --
    if '++' in clean or '--' in clean:
        standard_math_locations.append((idx + 1, line.strip(), "Increment/Decrement operator"))

    # Check for direct arithmetic outside SafeMath definition
    # SafeMath is defined between lines 25 and 140
    if (idx + 1 < 25 or idx + 1 > 140):
        # Look for +, -, *, / in expressions
        # Filter out comments, string literals, and function signatures
        if any(op in clean for op in [' + ', ' - ', ' * ', ' / ']):
            if not any(k in clean for k in ['import', 'pragma', 'event', 'function', 'string', 'require', 'abi.encode']):
                standard_math_locations.append((idx + 1, line.strip(), "Standard operator"))

print("\n--- Standard Math Operators / Increment Locations ---")
for loc in standard_math_locations:
    print(f"Line {loc[0]}: {loc[1]} [{loc[2]}]")

print("\n=== Module 2: Compiler Anomaly Audit (v0.6.12) ===")
# 1. KeccakCaching
# Bug: Solc 0.6.0 - 0.6.1 (Fixed in 0.6.2).
print("1. KeccakCaching Anomaly:")
print("   - Severity in v0.6.12: NOT AFFECTED (Bug present in v0.6.0 - v0.6.1, resolved in v0.6.2).")
print("   - Keccak256 usages in contract:")
keccak_matches = [ (idx+1, line.strip()) for idx, line in enumerate(lines) if 'keccak256' in line ]
for line_no, code in keccak_matches:
    print(f"     * Line {line_no}: {code}")

# 2. MemoryByteArrayElementDeleteClearsWholeWord
# Bug: Deleting an element of a bytes/byte array in memory clears 32 bytes instead of 1.
print("\n2. MemoryByteArrayElementDeleteClearsWholeWord Anomaly:")
print("   - Codebase check: Scanning for 'delete' keyword on byte/array indexing...")
delete_matches = [ (idx+1, line.strip()) for idx, line in enumerate(lines) if 'delete' in line ]
print(f"   - 'delete' occurrences in LiquidETHV1.sol: {len(delete_matches)}")
if not delete_matches:
    print("   - Result: ZERO occurrences of 'delete'. No risk of MemoryByteArrayElementDeleteClearsWholeWord.")
else:
    for line_no, code in delete_matches:
        print(f"     * Line {line_no}: {code}")
