import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

if (process.env.NODE_ENV === "production") {
  const expireGoogleReviews = () => prisma.googleReviewSnapshot.deleteMany({
    where: { fetchedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  }).catch(() => console.error("Google review snapshot cleanup failed."));
  void expireGoogleReviews();
  setInterval(expireGoogleReviews, 60 * 60 * 1000).unref();
}

export default prisma;
