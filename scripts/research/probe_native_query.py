# /// script
# requires-python = ">=3.11"
# dependencies = ["pefile==2024.8.26", "unicorn==2.1.4"]
# ///
# SPDX-License-Identifier: Apache-2.0
"""Replay hash-pinned PE instructions with synthetic inputs in Unicorn.

Usage: uv run scripts/research/probe_native_query.py <Windows depot directory>
No Windows process, game state, network access, hooks, or native OS execution.
Query probes stub callees and execute its control flow and real hit predicate.
Sample probes execute the transform chain on clean synthetic scene nodes.
Ground probes execute helper/shape/filter construction but stub physics and
selected services. KD-tree probes use constructed trees, not native-built trees.
This is NOT qualification.
"""

import argparse
import hashlib
import json
import math
import struct
from pathlib import Path

import pefile
from unicorn import Uc, UC_ARCH_X86, UC_MODE_64, UC_HOOK_CODE
from unicorn.x86_const import (
    UC_X86_REG_RAX, UC_X86_REG_RCX, UC_X86_REG_RDX, UC_X86_REG_R8,
    UC_X86_REG_R9, UC_X86_REG_RSP, UC_X86_REG_RIP, UC_X86_REG_XMM1,
)


PROFILES = {
    "client": {
        "sha256": "d7db25d48f1d10c5e0b0296e20ed803426eb9509da41760daeda39dd35ba89b9",
        "query": 0x80CCF0, "end": 0x80D015,
        "system": 0x854310, "origin": 0x2197E0, "field": 0x84F770,
        "skip_movement": 0x8D92D0, "construct": 0x17FA00,
        "init_trace": 0x17761D0, "visibility": 0x8273F0,
        "hit": 0x360480, "ground": 0x8E72A0, "max_coord_iat": 0x1AA9758,
        "movement_offset": 0x1330,
        "slots": (0x2B0, 0x4F0, 0xAB8, 0x5C0, 0x500),
    },
    "server": {
        "sha256": "098d4ddd57e2fbe9a73623a2bf68ebaff86f7b6342ddb3d5a0f69cd6335b31cc",
        "query": 0x9FB090, "end": 0x9FB3B5,
        "system": 0xA3DAB0, "origin": 0x3D0410, "field": 0xA39F10,
        "skip_movement": 0xACB970, "construct": 0x149E10,
        "init_trace": 0x14A0920, "visibility": 0x9624A0,
        "hit": 0x2BCDD0, "ground": 0xADEA70, "max_coord_iat": 0x1768F80,
        "movement_offset": 0xB50,
        "slots": (0x2C8, 0x558, 0xCA8, 0x660, 0x570),
    },
}
TIER0_SHA256 = "4e0dcb0af3f6953f37ddaed0f4e67a56d031f1e84964a262148f8a6f80547791"
HEAP, STACK, STOP = 0x100000, 0x300000, 0x110000
BOMB, PAWN, MOVEMENT, SYSTEM = 0x101000, 0x103000, 0x106000, 0x108000
VTABLE, OWNER, OWNER_VTABLE = 0x109000, 0x10B000, 0x10C000
ORIGIN, DAMAGE, DIRECTION = 0x10D000, 0x10D100, 0x10D110
STUBS = {name: 0x111000 + i * 0x10 for i, name in enumerate(
    ("sample", "gate1", "gate2", "owner", "owner_skip"))}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


class Machine:
    def __init__(self, path, expected_hash):
        data = path.read_bytes()
        require(hashlib.sha256(data).hexdigest() == expected_hash,
                f"Unsupported binary SHA-256: {path.name}")
        pe = pefile.PE(data=data, fast_load=True)
        self.base = pe.OPTIONAL_HEADER.ImageBase
        image = pe.get_memory_mapped_image()
        self.uc = Uc(UC_ARCH_X86, UC_MODE_64)
        self.uc.mem_map(self.base, (pe.OPTIONAL_HEADER.SizeOfImage + 4095) & ~4095)
        self.uc.mem_write(self.base, image)
        self.uc.mem_map(HEAP, 0x100000)
        self.uc.mem_map(STACK, 0x100000)
        self.uc.reg_write(UC_X86_REG_RSP, STACK + 0xFFF08)
        self.put(self.reg(UC_X86_REG_RSP), "Q", STOP)

    def reg(self, name):
        return self.uc.reg_read(name)

    def put(self, address, fmt, *values):
        self.uc.mem_write(address, struct.pack("<" + fmt, *values))

    def get(self, address, fmt):
        return struct.unpack("<" + fmt, self.uc.mem_read(address, struct.calcsize("<" + fmt)))

    def ret(self, value=0):
        rsp = self.reg(UC_X86_REG_RSP)
        self.uc.reg_write(UC_X86_REG_RAX, value)
        self.uc.reg_write(UC_X86_REG_RIP, self.get(rsp, "Q")[0])
        self.uc.reg_write(UC_X86_REG_RSP, rsp + 8)

    def run(self, rva):
        self.uc.emu_start(self.base + rva, STOP, count=100000)
        require(self.reg(UC_X86_REG_RIP) == STOP, "Instruction budget exhausted")


def query_probe(path, profile, case):
    m = Machine(path, profile["sha256"])
    first, origin, ground_z = (10.0, 20.0, 90.0), (10.0, 20.0, 54.0), 12.0
    calls, samples = [], []
    m.put(PAWN, "Q", VTABLE)
    m.put(OWNER, "Q", OWNER_VTABLE)
    m.put(PAWN + profile["movement_offset"], "Q", 0 if case == "no-movement" else MOVEMENT)
    for slot, name in zip(profile["slots"][:4], ("sample", "gate1", "gate2", "owner")):
        m.put(VTABLE + slot, "Q", STUBS[name])
    m.put(OWNER_VTABLE + profile["slots"][4], "Q", STUBS["owner_skip"])
    m.put(ORIGIN, "3f", *origin)
    m.put(ORIGIN + 0x10, "f", 16384.0)
    m.put(m.base + profile["max_coord_iat"], "Q", ORIGIN + 0x10)
    m.put(DAMAGE, "B", 0xA5)
    m.put(DIRECTION, "3f", 9.0, 8.0, 7.0)
    for reg, value in ((UC_X86_REG_RCX, BOMB), (UC_X86_REG_RDX, PAWN),
                       (UC_X86_REG_R8, DAMAGE), (UC_X86_REG_R9, DIRECTION)):
        m.uc.reg_write(reg, 0 if reg == UC_X86_REG_RDX and case == "no-target" else value)

    def hook(_uc, address, _size, _data):
        rva = address - m.base
        rcx, rdx, r8, r9, rsp = [m.reg(r) for r in
            (UC_X86_REG_RCX, UC_X86_REG_RDX, UC_X86_REG_R8, UC_X86_REG_R9, UC_X86_REG_RSP)]
        if address == STUBS["sample"]:
            m.put(rdx, "3f", *first)
            m.ret(rdx)
        elif address in (STUBS["gate1"], STUBS["gate2"]):
            rejected = case == ("gate1-false" if address == STUBS["gate1"] else "gate2-false")
            m.ret(int(not rejected))
        elif address == STUBS["owner"]:
            m.ret(OWNER if case == "owner-skip" else 0)
        elif address == STUBS["owner_skip"]:
            m.ret(1)
        elif rva == profile["system"]:
            m.ret(0 if case == "no-system" else SYSTEM)
        elif rva == profile["origin"]:
            m.ret(ORIGIN)
        elif rva == profile["field"]:
            samples.append(m.get(r8, "3f"))
            calls.append(f"field-{len(samples)}")
            failed = case == ("first-failure" if len(samples) == 1 else "second-failure")
            if not failed:
                m.put(r9, "B", 150 if len(samples) == 1 else 120)
                m.put(m.get(rsp + 0x28, "Q")[0], "3f", float(len(samples)), 0.0, 0.0)
                m.put(m.get(rsp + 0x30, "Q")[0], "3f", 16.0, 24.0, 96.0)
            m.ret(int(not failed))
        elif rva == profile["skip_movement"]:
            m.ret(int(case == "movement-skip"))
        elif rva in (profile["construct"], profile["init_trace"]):
            # No engine constructor is executed; the visibility stub fills the
            # two fields consumed by the *unmodified* native hit predicate.
            m.ret()
        elif rva == profile["visibility"]:
            calls.append("visibility")
            require(m.get(rdx, "3f") == first, "Unexpected visibility start")
            require(m.get(r8, "3f") == (16.0, 24.0, 96.0), "Unexpected visibility end")
            require(r9 == 0 and m.get(rsp + 0x28, "Q")[0] == 1, "Unexpected trace filter arguments")
            output = m.get(rsp + 0x30, "Q")[0]
            fraction = 1.0 if case in ("clear", "solid-flag") else 0.5
            m.put(output + 0xAC, "f", fraction)
            m.put(output + 0xBB, "B", int(case == "solid-flag"))
            m.ret()
        elif rva == profile["ground"]:
            calls.append("ground")
            require(rcx == MOVEMENT, "Unexpected movement service")
            m.put(r8, "f", ground_z)
            m.ret(int(case != "ground-failure"))
        else:
            require(profile["query"] <= rva < profile["end"] or
                    profile["hit"] <= rva < profile["hit"] + 0x20,
                    f"Unstubbed instruction at RVA {rva:#x}")

    m.uc.hook_add(UC_HOOK_CODE, hook)
    m.run(profile["query"])
    valid = bool(m.reg(UC_X86_REG_RAX) & 0xFF)
    expected_valid = case not in ("no-target", "no-system", "first-failure")
    second_cases = ("second-success", "second-failure", "solid-flag")
    expected_damage = 0xA5 if not expected_valid else (120 if case in ("second-success", "solid-flag") else 150)
    require(valid == expected_valid, f"{case}: validity mismatch")
    require(m.get(DAMAGE, "B")[0] == expected_damage, f"{case}: damage mismatch")
    expected_samples = 0 if case in ("no-target", "no-system") else (2 if case in second_cases else 1)
    require(len(samples) == expected_samples, f"{case}: sample count mismatch")
    if len(samples) == 2:
        require(samples[1] == (10.0, 20.0, 48.0), f"{case}: second sample mismatch")
    expected_calls = [f"field-{i + 1}" for i in range(min(expected_samples, 1))]
    if case in ("clear", "solid-flag", "ground-failure", "second-success", "second-failure"):
        expected_calls.append("visibility")
        if case != "clear":
            expected_calls.append("ground")
    if expected_samples == 2:
        expected_calls.append("field-2")
    require(calls == expected_calls, f"{case}: stage order mismatch: {calls}")
    expected_direction = (9.0, 8.0, 7.0) if not expected_valid else (
        (2.0, 0.0, 0.0) if expected_damage == 120 else (1.0, 0.0, 0.0))
    require(m.get(DIRECTION, "3f") == expected_direction, f"{case}: direction mismatch")
    return {"case": case, "valid": valid, "damageByte": expected_damage,
            "calls": calls, "samplePositions": samples}


def nearest_probe(path, split, reverse):
    m = Machine(path, TIER0_SHA256)
    tree, nodes, blocks, pointers, vertices, query = (HEAP + i * 0x100 for i in range(6))
    m.put(tree + 8, "Q", nodes)
    m.put(tree + 0x20, "IIIIQ", 4, 15, 1, 1, blocks)
    m.put(blocks + 8, "Q", pointers)
    m.put(vertices, "6f", -1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    order = [vertices + 12, vertices] if reverse else [vertices, vertices + 12]
    m.put(pointers, "2Q", *order)
    m.put(query, "3f", 0.0, 0.0, 0.0)
    if split:
        # Valid x-split at zero: left has -1, right has +1. Equality visits right.
        m.put(nodes, "iiif", 1, 2, 0, 0.0)
        m.put(nodes + 16, "4i", 0, 1, 255, 0)
        m.put(nodes + 32, "4i", 1, 1, 255, 0)
    else:
        m.put(nodes, "4i", 0, 2, 255, 0)
    m.uc.reg_write(UC_X86_REG_RCX, tree)
    m.uc.reg_write(UC_X86_REG_RDX, query)

    def hook(_uc, address, _size, _data):
        rva = address - m.base
        require(0x17FBD0 <= rva < 0x17FC00 or 0x180020 <= rva < 0x18044C,
                f"Unexpected KD-tree instruction {rva:#x}")

    m.uc.hook_add(UC_HOOK_CODE, hook)
    m.run(0x17FBD0)
    selected = (m.reg(UC_X86_REG_RAX) - vertices) // 12
    expected = 1 if split or reverse else 0
    require(selected == expected, "KD-tree tie result mismatch")
    return {"case": "split-plane-tie" if split else ("reversed-leaf-tie" if reverse else "leaf-tie"),
            "selectedSyntheticIndex": selected}


def sample_probe(path, case):
    """Execute the actual client virtual sample chain with a clean scene node."""
    m = Machine(path, PROFILES["client"]["sha256"])
    collision, node, output = 0x10E000, 0x10F000, 0x10D200
    m.put(PAWN, "Q", VTABLE)
    m.put(VTABLE + 0x218, "Q", m.base + 0x167180)
    m.put(PAWN + 0x330, "Q", node)
    m.put(PAWN + 0x340, "Q", 0 if case == "no-collision" else collision)
    m.put(collision + 8, "Q", PAWN)
    height = 54.0 if case == "short-hull" else 72.0
    m.put(collision + 0x40, "6f", -14.0, -12.0, 0.0, 18.0, 20.0, height)
    m.put(collision + 0x5B, "B", 2 if case == "axis-aligned" else 1)
    rotate = case in ("rotated-scaled", "axis-aligned")
    scale = 2.0 if rotate else 1.0
    m.put(node + 0xC8, "3f", 10.0, 20.0, 54.0)
    m.put(node + 0xD4, "3f", 0.0, 90.0 if rotate else 0.0, 0.0)
    m.put(node + 0xE0, "f", scale)
    m.put(node + 0x10, "8f", 10.0, 20.0, 54.0, scale,
          0.0, 0.0, math.sqrt(0.5) if rotate else 0.0,
          math.sqrt(0.5) if rotate else 1.0)
    m.uc.reg_write(UC_X86_REG_RCX, PAWN)
    m.uc.reg_write(UC_X86_REG_RDX, output)
    ranges = ((0x16D730, 0x16D7A7), (0x167180, 0x167188),
              (0x1667B0, 0x1667FC), (0x15EB40, 0x15ECEA),
              (0xB95160, 0xB95177), (0xB95190, 0xB951A9),
              (0x2197B0, 0x21983D), (0x218630, 0x218659),
              (0x15C2E0, 0x15C30B))

    def hook(_uc, address, _size, _data):
        rva = address - m.base
        require(any(start <= rva < end for start, end in ranges),
                f"Unexpected sample instruction {rva:#x}")

    m.uc.hook_add(UC_HOOK_CODE, hook)
    m.run(0x16D730)
    actual = m.get(output, "3f")
    expected = ((10.0, 20.0, 54.0) if case == "no-collision" else
                (2.0, 24.0, 126.0) if case == "rotated-scaled" else
                (10.0 + 2.0 * scale, 20.0 + 4.0 * scale, 54.0 + height / 2.0 * scale))
    require(all(abs(a - b) <= 0.00001 for a, b in zip(actual, expected)),
            f"{case}: transformed sample mismatch: {actual}")
    return {"case": case, "samplePosition": actual}


def ground_probe(path, case):
    """Execute ground-helper shape/filter construction; stub the physics engine."""
    m = Machine(path, PROFILES["client"]["sha256"])
    definitions, output = 0x10E000, 0x10D200
    m.put(PAWN, "Q", VTABLE)
    m.put(VTABLE + 0x9F8, "Q", m.base + 0x9586B0)
    m.put(VTABLE + 0x218, "Q", m.base + 0x167180)
    m.put(PAWN + 0x520, "I", 0xFFFFFFFF)
    m.put(MOVEMENT + 0x38, "Q", PAWN)
    m.put(MOVEMENT + 0x408, "B", int(case == "ducked"))
    m.put(ORIGIN, "3f", 10.0, 20.0, 54.0)
    for offset, size in ((0xC, 16.0), (0x24, 12.0), (0x48, 8.0)):
        m.put(definitions + offset, "6f", -size, -size, 0.0, size, size, size * 4.0)
    if case == "degenerate":
        m.put(definitions + 0xC, "6f", *([0.0] * 6))
    m.uc.reg_write(UC_X86_REG_RCX, MOVEMENT)
    m.uc.reg_write(UC_X86_REG_R8, output)
    m.uc.reg_write(UC_X86_REG_XMM1, struct.unpack("<I", struct.pack("<f", 32.0))[0])
    captured = {}

    def hook(_uc, address, _size, _data):
        rva = address - m.base
        rcx, rdx, r8, r9, rsp = [m.reg(r) for r in
            (UC_X86_REG_RCX, UC_X86_REG_RDX, UC_X86_REG_R8, UC_X86_REG_R9, UC_X86_REG_RSP)]
        if rva == 0x2197E0:
            m.ret(ORIGIN)
        elif rva == 0x94DE10:
            m.ret(int(case == "special-hull"))
        elif rva == 0xAC1090:
            m.ret(definitions)
        elif rva in (0x17FA00, 0x17761D0):
            m.ret()
        elif rva in (0x9DD840, 0x9EA770):
            # Entity/owner handles and collision groups are controlled inputs.
            m.ret(0xFFFFFFFF if rva == 0x9DD840 else 0)
        elif rva == 0xA19EF0:
            trace_filter, result = m.get(rsp + 0x28, "Q")[0], m.get(rsp + 0x30, "Q")[0]
            captured.update({"start": m.get(r8, "3f"), "end": m.get(r9, "3f"),
                             "shapeType": m.get(rdx + 0x28, "B")[0],
                             "bounds": m.get(rdx, "6f"),
                             "filterMasks": m.get(trace_filter + 8, "3Q"),
                             "collisionGroup": m.get(trace_filter + 0x38, "B")[0]})
            m.put(result + 0x8C, "f", 22.0)
            m.put(result + 0xAC, "f", 1.0 if case in ("miss", "solid-flag") else 0.5)
            m.put(result + 0xBB, "B", int(case == "solid-flag"))
            m.ret()
        else:
            ranges = ((0x8E72A0, 0x8E74CC), (0x8BD9B0, 0x8BDB03),
                      (0x36DBF0, 0x36DC45), (0x360480, 0x3604A0),
                      (0x9586B0, 0x9586B6), (0x167180, 0x167188))
            require(any(start <= rva < end for start, end in ranges),
                    f"Unstubbed ground-helper instruction {rva:#x}")

    m.uc.hook_add(UC_HOOK_CODE, hook)
    m.run(0x8E72A0)
    require(captured.get("start") == (10.0, 20.0, 54.0) and
            captured.get("end") == (10.0, 20.0, 22.0), "Ground trace endpoints mismatch")
    require(captured["filterMasks"] == (0xC3011, 0x48100, 0x40000) and
            captured["collisionGroup"] == 11, "Ground filter mismatch")
    require(captured["shapeType"] == (0 if case == "degenerate" else 2), "Ground shape mismatch")
    if case != "degenerate":
        size = 12.0 if case == "ducked" else (8.0 if case == "special-hull" else 16.0)
        require(captured["bounds"] == (-size, -size, 0.0, size, size, size * 4.0), "Ground bounds mismatch")
    valid = bool(m.reg(UC_X86_REG_RAX) & 0xFF)
    require(valid == (case != "miss"), "Ground validity mismatch")
    require(m.get(output, "f")[0] == 22.0, "Ground end-Z is written even on a miss")
    return {"case": case, "valid": valid, "correctionZ": 22.0, **captured}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("depot", type=Path)
    args = parser.parse_args()
    cases = ("no-target", "no-system", "first-failure", "gate1-false", "gate2-false",
             "no-movement", "movement-skip", "owner-skip", "clear", "solid-flag",
             "ground-failure", "second-success", "second-failure")
    results = {}
    for module, profile in PROFILES.items():
        path = args.depot / "game/csgo/bin/win64" / f"{module}.dll"
        results[module] = [query_probe(path, profile, case) for case in cases]
    tier0 = args.depot / "game/bin/win64/tier0.dll"
    client = args.depot / "game/csgo/bin/win64/client.dll"
    results["sample"] = [sample_probe(client, case) for case in
                         ("no-collision", "tall-hull", "short-hull", "rotated-scaled", "axis-aligned")]
    results["ground"] = [ground_probe(client, case) for case in
                         ("standing", "ducked", "special-hull", "degenerate", "miss", "solid-flag")]
    results["nearest"] = [nearest_probe(tier0, False, False), nearest_probe(tier0, False, True),
                          nearest_probe(tier0, True, False)]
    print(json.dumps({"qualified": False, "evidence": "synthetic-instruction-replay",
                      "binarySha256": {**{k: v["sha256"] for k, v in PROFILES.items()},
                                       "tier0": TIER0_SHA256},
                      "results": results}, indent=2))


if __name__ == "__main__":
    main()
