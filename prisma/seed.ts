import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const userData: Prisma.UserCreateInput[] = [
  {
    walletAddress: "0x1234567890123456789012345678901234567890",
  },
  {
    walletAddress: "0x0987654321098765432109876543210987654321",
  },
];

export async function main() {
  console.log("Start seeding...");
  for (const u of userData) {
    const user = await prisma.user.upsert({
      where: { walletAddress: u.walletAddress },
      update: {},
      create: u,
    });
    console.log(`Created user with id: ${user.id}`);
  }
  console.log("Seeding finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
