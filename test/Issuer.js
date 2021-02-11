// We import Chai to use its asserting functions here.
const { expect } = require("chai");

describe("contract testing", () => {
  // Mocha has four functions that let you hook into the the test runner's
  // lifecyle. These are: `before`, `beforeEach`, `after`, `afterEach`.

  // They're very useful to setup the environment for tests, and to clean it
  // up after they run.

  // A common pattern is to declare some variables, and assign them in the
  // `before` and `beforeEach` callbacks.

  let contractFactory;
  let staxToken;
  let bep20Token = new Array(3); // Random tokens to create pools for
  let iStaxToken
  let iStaxIssuer;
  let owner;
  let addr1;
  let addr2;
  let addrs;
  let res;
  let deployedBlockNumber;
  let amount = 5 * Math.pow(10, 5)


  beforeEach(async () => {

    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploying contracts
    contractFactory = await ethers.getContractFactory("StaxToken");
    staxToken = await contractFactory.deploy();

    for (i = 0; i < 3; i++) {
      contractFactory = await ethers.getContractFactory("bep20Token");
      bep20Token[i] = await contractFactory.deploy();
    }

    contractFactory = await ethers.getContractFactory("iStaxToken");
    iStaxToken = await contractFactory.deploy();

    deployedBlockNumber = await ethers.provider.getBlockNumber();
    contractFactory = await ethers.getContractFactory("iStaxIssuer");
    iStaxIssuer = await contractFactory.deploy(
                    iStaxToken.address,
                    owner.address,
                    deployedBlockNumber + 10,
                    deployedBlockNumber + 20,
                    deployedBlockNumber + 35,
                    5
                  );

    // Adding pools to iStaxIssuer.
    await iStaxIssuer.add(10, bep20Token[0].address, false);
    await iStaxIssuer.add(20, bep20Token[1].address, false);

    // Transfer ownership of iStaxTokens to iStaxIssuer
    await iStaxToken.transferOwnership(iStaxIssuer.address);
  });

  describe("Deployment sanity check", () => {

    it("should reference the right istax contract address", async () =>  {
        expect(await iStaxIssuer.iStax()).to.equal(iStaxToken.address);
    })

    it("should have the right owner", async () => {
        await expect(await iStaxIssuer.devaddr()).to.equal(owner.address);
    });

    it("should have the right constructor init values", async () => {
        expect(await iStaxIssuer.startBlock()).to.equal(deployedBlockNumber + 10);
        expect(await iStaxIssuer.firstBonusEndBlock()).to.equal(deployedBlockNumber + 20);
        expect(await iStaxIssuer.endOfRewardsBlock()).to.equal(deployedBlockNumber + 35);
        expect(await iStaxIssuer.halvingDuration()).to.equal(5);
    });

    it("should have added pools", async () => {
        const pool0 = await iStaxIssuer.poolInfo(0);
        expect(pool0.depositToken).to.equal(bep20Token[0].address);
        expect(pool0.allocPoint).to.equal(10);
        const pool1 = await iStaxIssuer.poolInfo(1);
        expect(pool1.depositToken).to.equal(bep20Token[1].address);
        expect(pool1.allocPoint).to.equal(20);
    })
  });

  describe("Testing deposit/withdrawals", () => {

    it("should do a simple deposit then withdrawal", async () => {
      while(await ethers.provider.getBlockNumber() < deployedBlockNumber + 10) {
        await ethers.provider.send("evm_mine");
      }

      await bep20Token[0].mint(addr1.address, amount);
      await expect(await bep20Token[0].balanceOf(addr1.address)).to.equal(amount);

      // deposit
      await bep20Token[0].connect(addr1).approve(iStaxIssuer.address, amount);
      await iStaxIssuer.connect(addr1).deposit(0, amount);
      res = await iStaxIssuer.userInfo(0, addr1.address);
      expect(res.amount).to.equal(amount);
      expect(await bep20Token[0].balanceOf(addr1.address)).to.equal(0);
      expect(await bep20Token[0].balanceOf(iStaxIssuer.address)).to.equal(amount);

      // withdraw
      const half = amount/2;
      await iStaxIssuer.massUpdatePools();
      await iStaxIssuer.connect(addr1).withdraw(0, half);
      res = await iStaxIssuer.userInfo(0, addr1.address);
      expect(res.amount).to.equal(half);
      expect(await bep20Token[0].balanceOf(addr1.address)).to.equal(half);
      expect(await bep20Token[0].balanceOf(iStaxIssuer.address)).to.equal(half);
    })

    it("should compute reward calculations correctly", async () => {
      while(await ethers.provider.getBlockNumber() < deployedBlockNumber + 10) {
        await ethers.provider.send("evm_mine");
      }

      // deposit
      const half = amount/2;
      const fifth = amount/5;
      await bep20Token[0].mint(addr1.address, amount);
      await bep20Token[0].connect(addr1).approve(iStaxIssuer.address, amount);
      await iStaxIssuer.connect(addr1).deposit(0, half);
      while(await ethers.provider.getBlockNumber() < deployedBlockNumber + 34) {
        await ethers.provider.send("evm_mine");
      }
      await iStaxIssuer.massUpdatePools();

      res = await iStaxIssuer.userInfo(0, addr1.address);
      expect(res.amount).to.equal(half);
      expect(res.rewardDebt).to.equal(0);
      res = await iStaxIssuer.poolInfo(0);
      expect(await iStaxToken.balanceOf(addr1.address)).to.equal(0);
      expect(res.acciStaxPerShare).to.equal(336000000);
      // multiplier =  12 * 8 + 5 * 4 + 5 * 2 = 126
      // istaxreward = 126 * 2 * 10 / 30 = 84
      // acciStaxPerShare = 84 * 10^12 / 250000 = 336000000

      // withdraw some
      await iStaxIssuer.connect(addr1).withdraw(0, fifth);
      res = await iStaxIssuer.userInfo(0, addr1.address);
      expect(res.amount).to.equal(half - fifth);
      expect(res.rewardDebt).to.equal(50); // 150000*336000000/10^12 = 50
      expect(await iStaxToken.balanceOf(addr1.address)).to.equal(84); // 250000 * 336000000 / 10^12 = 84

      // deposit more
      while(await ethers.provider.getBlockNumber() < deployedBlockNumber + 67) {
        await ethers.provider.send("evm_mine");
      }
      await iStaxIssuer.connect(addr1).deposit(0, half);
      res = await iStaxIssuer.poolInfo(0);
      expect(res.acciStaxPerShare).to.equal(476000000);
      // multiplier = 32 * 1
      // istaxreward = 32 * 2 * 10 / 30 = 21
      // new acciStaxPerShare = 336000000 + 21 * 10^12 / 150000 = 476000000

      res = await iStaxIssuer.userInfo(0, addr1.address);
      expect(res.amount).to.equal(half - fifth + half);
      expect(await bep20Token[0].balanceOf(addr1.address)).to.equal(fifth)
      expect(await iStaxToken.balanceOf(addr1.address)).to.equal(105); // 84 + 21
    })
  });

  describe("Testing multiplier", () => {

    it("should return the right multiplier values 1", async () => {
      while(await ethers.provider.getBlockNumber() < deployedBlockNumber + 35) {
        await ethers.provider.send("evm_mine");
      }
      expect(await iStaxIssuer.getMultiplier(deployedBlockNumber + 10, deployedBlockNumber + 25)).to.equal(120); // 15 * 8
    });

    it("should return the right multiplier values 2", async () => {
      while(await ethers.provider.getBlockNumber() < deployedBlockNumber + 35) {
        await ethers.provider.send("evm_mine");
      }
      expect(await iStaxIssuer.getMultiplier(deployedBlockNumber + 21, deployedBlockNumber + 29)).to.equal(48); // 4 * 8 + 4 * 4
    });

    it("should return the right multiplier values 3", async () => {
      while(await ethers.provider.getBlockNumber() < deployedBlockNumber + 50) {
        await ethers.provider.send("evm_mine");
      }
      expect(await iStaxIssuer.getMultiplier(deployedBlockNumber + 12, deployedBlockNumber + 50)).to.equal(149); // 13 * 8 + 5 * 4 + 5 * 2 + 15 * 1
    });

    it("should exclude bounds before startBlock", async () => {
      while(await ethers.provider.getBlockNumber() < deployedBlockNumber + 35) {
        await ethers.provider.send("evm_mine");
      }
      expect(await iStaxIssuer.getMultiplier(deployedBlockNumber + 0, deployedBlockNumber + 23)).to.equal(104); // 13 * 8
    });

    it("should exclude bounds after current block", async () => {
      while(await ethers.provider.getBlockNumber() < deployedBlockNumber + 33) {
        await ethers.provider.send("evm_mine");
      }
      expect(await iStaxIssuer.getMultiplier(deployedBlockNumber + 16, deployedBlockNumber + 54)).to.equal(98); // 9 * 8 + 5 * 4 + 3 * 2
    });
  });
});