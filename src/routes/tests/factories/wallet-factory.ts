import { createTestClient } from "./client-factory";
import { prisma } from "../../../lib/prisma";

interface CreateWalletOptions {
  clientId?: string;
  totalValue?: number;
}

export const TEST_ASSET_CLASS = { className: "ATIVO TESTE", percentage: 100 };

export async function createTestWallet(options: CreateWalletOptions = {}) {
  const { clientId, totalValue = 50000 } = options;

  let finalClientId = clientId;

  if (!finalClientId) {
    const client = await createTestClient();
    finalClientId = client.id;
  }

  const walletData = {
    totalValue: totalValue,
    assetClasses: TEST_ASSET_CLASS,
    clientId: finalClientId,
  };

  const wallet = await prisma.wallet.create({
    data: walletData,
  });

  return wallet;
}
