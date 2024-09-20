import { SupportedAptosChainIds } from "src/common/chains";
import { AptosEventID } from "src/processors/interfaces";
import { GenericCoinFlipEvent, GenericCoinFlipStat } from "src/models/mikro-orm/generic-coin-flip";
import { GenericCoinFlipProcessorUoW } from "src/processors/coprocessors/generic-coin-flip-uow";
import { GenericProcessorUoWTestHelper } from "./common/interfaces";
import { CoinFlipEvent } from "src/processors/coprocessors/config";

describe("GenericCoinFlipProcessorUoW", () => {
  let testHelper: GenericProcessorUoWTestHelper<GenericCoinFlipProcessorUoW>;
  const ALICE_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000000001";
  const BOB_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000000002";
  const CHARLIE_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000000003";
  const DAVID_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000000004";
  const EVE_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000000005";

  beforeAll(async () => {
    testHelper = await GenericProcessorUoWTestHelper.create(GenericCoinFlipProcessorUoW, [
      GenericCoinFlipEvent,
      GenericCoinFlipStat,
    ]);
  });

  beforeEach(async () => {
    await testHelper.clearDatabase();
    testHelper.resetCounters();
  });

  it("should handle multiple CoinFlipEvents correctly", async () => {
    // since CoinFlipEvent is the 0th registered event in GenericCoinFlipProcessorUoW.registerEventHandlers
    const coinFlipEventID: AptosEventID = testHelper.getRegisteredEventID(0);

    const eventAndTransactions = [
      // Alice's first flip - win
      await testHelper.createMockEventAndTransaction<CoinFlipEvent>({
        eventID: coinFlipEventID,
        accountAddress: ALICE_ADDRESS,
        data: {
          prediction: true,
          result: true,
          wins: "1",
          losses: "0",
        },
      }),
      // Bob's first flip - loss
      await testHelper.createMockEventAndTransaction<CoinFlipEvent>({
        eventID: coinFlipEventID,
        accountAddress: BOB_ADDRESS,
        data: {
          prediction: false,
          result: true,
          wins: "0",
          losses: "1",
        },
      }),
      // Alice's second flip - loss
      await testHelper.createMockEventAndTransaction<CoinFlipEvent>({
        eventID: coinFlipEventID,
        accountAddress: ALICE_ADDRESS,
        data: {
          prediction: true,
          result: false,
          wins: "1",
          losses: "1",
        },
      }),
      // Bob's second flip - win
      await testHelper.createMockEventAndTransaction<CoinFlipEvent>({
        eventID: coinFlipEventID,
        accountAddress: BOB_ADDRESS,
        data: {
          prediction: true,
          result: true,
          wins: "1",
          losses: "1",
        },
      }),
    ];

    for (const { event, transaction } of eventAndTransactions) {
      await testHelper.callEventHandler(coinFlipEventID, event, transaction);
    }

    const em = await testHelper.getEntityManager();

    // Check Alice's events
    const aliceEvents = await em.find(
      GenericCoinFlipEvent,
      {
        accountAddress: ALICE_ADDRESS,
        chainId: SupportedAptosChainIds.JESTNET,
      },
      { orderBy: { sequenceNumber: "ASC" } },
    );
    expect(aliceEvents).toHaveLength(2);
    expect(aliceEvents[0].wins).toBe(1n);
    expect(aliceEvents[0].losses).toBe(0n);
    expect(aliceEvents[1].wins).toBe(1n);
    expect(aliceEvents[1].losses).toBe(1n);

    // Check Bob's events
    const bobEvents = await em.find(
      GenericCoinFlipEvent,
      {
        accountAddress: BOB_ADDRESS,
        chainId: SupportedAptosChainIds.JESTNET,
      },
      { orderBy: { sequenceNumber: "ASC" } },
    );
    expect(bobEvents).toHaveLength(2);
    expect(bobEvents[0].wins).toBe(0n);
    expect(bobEvents[0].losses).toBe(1n);
    expect(bobEvents[1].wins).toBe(1n);
    expect(bobEvents[1].losses).toBe(1n);

    // Check overall stats
    const stats = await em.findOne(GenericCoinFlipStat, { chainId: SupportedAptosChainIds.JESTNET });
    expect(stats).toBeDefined();
    expect(stats?.totalWins).toBe(2n);
    expect(stats?.totalLosses).toBe(2n);
    expect(stats?.winPercentage).toBeCloseTo(0.5, 2);
  });

  it("should handle concurrent flips from multiple accounts with varying time intervals", async () => {
    const coinFlipEventID: AptosEventID = testHelper.getRegisteredEventID(0);

    const createFlipEvent = async (
      address: string,
      prediction: boolean,
      result: boolean,
      wins: string,
      losses: string,
      timeOffset: number = 0,
    ) => {
      return testHelper.createMockEventAndTransaction<CoinFlipEvent>({
        eventID: coinFlipEventID,
        accountAddress: address,
        data: { prediction, result, wins, losses },
        timestamp: BigInt(Date.now() + timeOffset),
      });
    };

    const eventAndTransactions = [
      // Quick succession of events
      await createFlipEvent(ALICE_ADDRESS, true, true, "1", "0", 0),
      await createFlipEvent(BOB_ADDRESS, false, false, "1", "0", 100),
      await createFlipEvent(CHARLIE_ADDRESS, true, false, "0", "1", 200),
      await createFlipEvent(DAVID_ADDRESS, false, true, "0", "1", 300),
      await createFlipEvent(EVE_ADDRESS, true, true, "1", "0", 400),

      // Gap in time
      await createFlipEvent(ALICE_ADDRESS, false, false, "2", "0", 5000),
      await createFlipEvent(BOB_ADDRESS, true, true, "2", "0", 5100),

      // Another quick succession
      await createFlipEvent(CHARLIE_ADDRESS, false, false, "1", "1", 10000),
      await createFlipEvent(DAVID_ADDRESS, true, true, "1", "1", 10100),
      await createFlipEvent(EVE_ADDRESS, false, true, "1", "1", 10200),

      // Winning streak for Alice
      await createFlipEvent(ALICE_ADDRESS, true, true, "3", "0", 15000),
      await createFlipEvent(ALICE_ADDRESS, true, true, "4", "0", 15100),
      await createFlipEvent(ALICE_ADDRESS, true, true, "5", "0", 15200),

      // Losing streak for Bob
      await createFlipEvent(BOB_ADDRESS, false, true, "2", "1", 20000),
      await createFlipEvent(BOB_ADDRESS, true, false, "2", "2", 20100),
      await createFlipEvent(BOB_ADDRESS, false, true, "2", "3", 20200),
    ];

    for (const { event, transaction } of eventAndTransactions) {
      await testHelper.callEventHandler(coinFlipEventID, event, transaction);
    }

    const em = await testHelper.getEntityManager();

    // Check individual account stats
    const checkAccountStats = async (address: string, expectedWins: bigint, expectedLosses: bigint) => {
      const events = await em.find(
        GenericCoinFlipEvent,
        {
          accountAddress: address,
          chainId: SupportedAptosChainIds.JESTNET,
        },
        { orderBy: { sequenceNumber: "DESC" }, limit: 1 },
      );
      expect(events[0].wins).toBe(expectedWins);
      expect(events[0].losses).toBe(expectedLosses);
    };

    await checkAccountStats(ALICE_ADDRESS, 5n, 0n);
    await checkAccountStats(BOB_ADDRESS, 2n, 3n);
    await checkAccountStats(CHARLIE_ADDRESS, 1n, 1n);
    await checkAccountStats(DAVID_ADDRESS, 1n, 1n);
    await checkAccountStats(EVE_ADDRESS, 1n, 1n);

    // Check global stats
    const globalStats = await em.findOne(GenericCoinFlipStat, { chainId: SupportedAptosChainIds.JESTNET });
    expect(globalStats).toBeDefined();
    expect(globalStats?.totalWins).toBe(10n);
    expect(globalStats?.totalLosses).toBe(6n);
    expect(globalStats?.winPercentage).toBeCloseTo(0.625, 3);

    // Check total number of events
    const totalEvents = await em.count(GenericCoinFlipEvent, { chainId: SupportedAptosChainIds.JESTNET });
    expect(totalEvents).toBe(16);
  });
});
