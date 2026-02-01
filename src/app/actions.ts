"use server";

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { containsProfanity } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function loginWithWallet(walletAddress: string) {
  if (!walletAddress) {
    throw new Error("Wallet address is required");
  }

  try {
    const user = await prisma.user.upsert({
      where: {
        walletAddress: walletAddress,
      },
      update: {},
      create: {
        walletAddress: walletAddress,
      },
    });
    return { success: true, user };
  } catch (error) {
    console.error("Error logging in with wallet:", error);
    return { success: false, error: "Failed to login with wallet" };
  }
}

export async function publishPost(formData: FormData) {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const postId = formData.get("postId") as string;

  if (!title?.trim()) {
    throw new Error("Title is required");
  }

  if (containsProfanity(content)) {
    throw new Error("Content contains profanity");
  }

  // NOTE: Post creation logic is disabled/broken as Post model was removed.
  // We should likely remove/refactor this, but for now just commenting it out to fix build
  // or leaving as is if it won't be called.
  // Given user asked to remove posts, this function is now deprecated.
  throw new Error("Post functionality is deprecated");

  /*
  const post = await prisma.post.upsert({
    where: {
      id: parseInt(postId ?? "-1"),
      author: {
        email: session.user.email!,
      },
    },
    update: {
      title: title.trim(),
      content: content?.trim(),
      published: true,
    },
    create: {
      title: title.trim(),
      content: content?.trim(),
      published: true,
      author: {
        connect: {
          email: session.user.email!,
        },
      },
    },
  });

  revalidatePath(`/posts/${post.id}`);
  revalidatePath("/posts");
  redirect(`/posts/${post.id}`);
  */
}

export async function saveDraft(formData: FormData) {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }
  // Deprecated as Post model was removed
  throw new Error("Post functionality is deprecated");
}

export async function searchUsers(query: string) {
  if (!query || query.length < 3) return { success: true, users: [] };

  try {
    const users = await prisma.user.findMany({
      where: {
        walletAddress: {
          contains: query,
          mode: "insensitive",
        },
      },
      take: 10,
      select: {
        id: true,
        walletAddress: true,
      },
    });
    return { success: true, users };
  } catch (error) {
    console.error("Error searching users:", error);
    return { success: false, error: "Failed to search users" };
  }
}
