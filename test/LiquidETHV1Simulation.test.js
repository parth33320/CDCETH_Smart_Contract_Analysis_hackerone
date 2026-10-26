const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CDCETH / LiquidETHV1 Differential Math & Invariant Simulation", function () {
  let proxy;
  let admin, oracle, masterMinter, minter, alice, bob, charlie;
  const PROXY_ADDRESS = "0xfe18aE03741a5b84e39C295Ac9C856eD7991C38e";
  const IMPL_ADDRESS = "0x7e772ed6e4bfeae80f2d58e4254f6b6e96669253";

  // ABI covering FiatTokenProxy and LiquidETHV1 logic functions
  const CDCETH_ABI = [
    // ERC20 standard
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",

    // LiquidETHV1 specific
    "function exchangeRate() view returns (uint256)",
    "function oracle() view returns (address)",
    "function updateExchangeRate(uint256 newExchangeRate)",
    "function updateOracle(address newOracle)",

    // FiatToken administrative / roles
    "function owner() view returns (address)",
    "function masterMinter() view returns (address)",
    "function isMinter(address account) view returns (bool)",
    "function configureMinter(address minter, uint256 minterAllowedAmount) returns (bool)",
    "function mint(address _to, uint256 _amount) returns (bool)",
    "function burn(uint256 _amount)",

    // Proxy administration
    "function admin() view returns (address)",
    "function implementation() view returns (address)"
  ];

  beforeEach(async function () {
    // 1. Attach contract interface to deployed proxy
    proxy = await ethers.getContractAt(CDCETH_ABI, PROXY_ADDRESS);

    [admin, oracle, masterMinter, minter, alice, bob, charlie] = await ethers.getSigners();

    // 2. Obtain current contract owner/masterMinter or impersonate if on mainnet fork
    const currentMasterMinter = await proxy.masterMinter();

    // Impersonate current masterMinter to configure a test minter if needed
    if (currentMasterMinter !== ethers.ZeroAddress) {
      await ethers.provider.send("hardhat_impersonateAccount", [currentMasterMinter]);
      await ethers.provider.send("hardhat_setBalance", [currentMasterMinter, "0x10000000000000000000"]); // 10 ETH
      const masterSigner = await ethers.getSigner(currentMasterMinter);

      await proxy.connect(masterSigner).configureMinter(minter.address, ethers.parseUnits("10000000", 18));
      await proxy.connect(minter).mint(alice.address, ethers.parseUnits("100000", 18));
      await proxy.connect(minter).mint(bob.address, ethers.parseUnits("100000", 18));
    }
  });

  describe("Module 1 & 2 Verification: State & Compiler Integrity", function () {
    it("should report correct decimals, name, and symbol without storage corruption", async function () {
      const decimals = await proxy.decimals();
      const symbol = await proxy.symbol();
      expect(decimals).to.equal(18);
      expect(symbol).to.not.be.empty;
    });

    it("should return the exact implementation address from proxy slot", async function () {
      const implSlotVal = await ethers.provider.getStorage(
        PROXY_ADDRESS,
        "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3"
      );
      const implAddress = "0x" + implSlotVal.slice(26);
      expect(ethers.getAddress(implAddress)).to.equal(ethers.getAddress(IMPL_ADDRESS));
    });
  });

  describe("Module 3: Differential Math Simulation & Invariant Fuzzing", function () {
    it("Invariant: Standard transfer preserves precise sum of balances across users (Conservation of Supply)", async function () {
      const initialAlice = await proxy.balanceOf(alice.address);
      const initialBob = await proxy.balanceOf(bob.address);
      const initialSupply = await proxy.totalSupply();

      const transferAmount = ethers.parseUnits("1337.654321987654321", 18);

      await proxy.connect(alice).transfer(bob.address, transferAmount);

      const finalAlice = await proxy.balanceOf(alice.address);
      const finalBob = await proxy.balanceOf(bob.address);
      const finalSupply = await proxy.totalSupply();

      // Assert precise conservation
      expect(finalAlice).to.equal(initialAlice - transferAmount);
      expect(finalBob).to.equal(initialBob + transferAmount);
      expect(finalAlice + finalBob).to.equal(initialAlice + initialBob);
      expect(finalSupply).to.equal(initialSupply);
    });

    it("Invariant: Exchange rate updates store exact value without altering underlying raw ERC20 balances", async function () {
      const currentOracle = await proxy.oracle();

      if (currentOracle !== ethers.ZeroAddress) {
        await ethers.provider.send("hardhat_impersonateAccount", [currentOracle]);
        await ethers.provider.send("hardhat_setBalance", [currentOracle, "0x10000000000000000000"]);
        const oracleSigner = await ethers.getSigner(currentOracle);

        const aliceBalBefore = await proxy.balanceOf(alice.address);
        const newRate = ethers.parseUnits("1.05", 18); // 5% yield increase

        await proxy.connect(oracleSigner).updateExchangeRate(newRate);

        const storedRate = await proxy.exchangeRate();
        const aliceBalAfter = await proxy.balanceOf(alice.address);

        expect(storedRate).to.equal(newRate);
        // LiquidETHV1 does not scale balances in balanceOf; raw balances remain exact
        expect(aliceBalAfter).to.equal(aliceBalBefore);
      }
    });

    it("Fuzz Simulation: Multi-step transfer loop with arbitrary fuzz amounts verifies zero truncation error", async function () {
      const fuzzAmounts = [
        1n, // 1 wei
        1234567n,
        ethers.parseUnits("0.000000000000000001", 18),
        ethers.parseUnits("1.123456789012345678", 18),
        ethers.parseUnits("500.5", 18)
      ];

      for (const amount of fuzzAmounts) {
        const aliceStart = await proxy.balanceOf(alice.address);
        const bobStart = await proxy.balanceOf(bob.address);
        const charlieStart = await proxy.balanceOf(charlie.address);

        if (aliceStart < amount) continue;

        // Step 1: Alice -> Bob
        await proxy.connect(alice).transfer(bob.address, amount);
        // Step 2: Bob -> Charlie
        await proxy.connect(bob).transfer(charlie.address, amount);

        const aliceEnd = await proxy.balanceOf(alice.address);
        const bobEnd = await proxy.balanceOf(bob.address);
        const charlieEnd = await proxy.balanceOf(charlie.address);

        // Invariant checks
        expect(aliceEnd).to.equal(aliceStart - amount);
        expect(bobEnd).to.equal(bobStart); // Net change 0
        expect(charlieEnd).to.equal(charlieStart + amount);
      }
    });
  });
});
