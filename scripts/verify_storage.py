import solcx
import json
import os
from Crypto.Hash import keccak

solcx.install_solc('0.6.12')
solcx.set_solc_version('0.6.12')

with open('contracts/impl/LiquidETHV1.sol') as f:
    source = f.read()

input_json = {
    'language': 'Solidity',
    'sources': {
        'LiquidETHV1.sol': {'content': source}
    },
    'settings': {
        'outputSelection': {
            '*': {
                '*': ['storageLayout', 'abi']
            }
        }
    }
}

res = solcx.compile_standard(input_json, solc_version='0.6.12')
layout = res['contracts']['LiquidETHV1.sol']['LiquidETHV1']['storageLayout']

print("=== LiquidETHV1 Storage Layout (Sequential Slots) ===")
for item in layout['storage']:
    print(f"Slot {item['slot']:>2}, Offset {item['offset']}: {item['label']} ({item['type']})")

def k256(s):
    k = keccak.new(digest_bits=256)
    k.update(s.encode('utf-8'))
    return "0x" + k.hexdigest()

oracle_pos = k256("com.crypto.liquidETH.exchangeRateOracle")
rate_pos = k256("com.crypto.liquidETH.exchangeRate")
proxy_admin_pos = "0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b"
proxy_impl_pos = "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3"

print("\n=== Custom Assembly Storage Slots ===")
print(f"_EXCHANGE_RATE_ORACLE_POSITION: {oracle_pos}")
print(f"Verify k256('com.crypto.liquidETH.exchangeRateOracle'): {oracle_pos}")
print(f"_EXCHANGE_RATE_POSITION:        {rate_pos}")
print(f"Verify k256('com.crypto.liquidETH.exchangeRate'):       {rate_pos}")

print("\n=== Proxy Administrative Slots ===")
print(f"FiatTokenProxy ADMIN_SLOT:          {proxy_admin_pos}")
print(f"Verify k256('org.zeppelinos.proxy.admin'):          {k256('org.zeppelinos.proxy.admin')}")
print(f"FiatTokenProxy IMPLEMENTATION_SLOT: {proxy_impl_pos}")
print(f"Verify k256('org.zeppelinos.proxy.implementation'):   {k256('org.zeppelinos.proxy.implementation')}")

print("\n=== Storage Collision Verification ===")
all_impl_slots = set(range(19)) # slots 0 to 18
all_impl_slots.add(int(oracle_pos, 16))
all_impl_slots.add(int(rate_pos, 16))

admin_int = int(proxy_admin_pos, 16)
impl_int = int(proxy_impl_pos, 16)

print(f"Admin Slot in Impl Slots? {admin_int in all_impl_slots}")
print(f"Implementation Slot in Impl Slots? {impl_int in all_impl_slots}")
