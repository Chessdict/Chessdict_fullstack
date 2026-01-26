import prisma from "@/lib/prisma";
import { PostForm } from "@/components/post";
import { Post } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const posts = await prisma.post.findMany({
    where: { published: true },
    orderBy: { createdAt: "desc" },
  });

  const drafts = await prisma.post.findMany({
    where: { published: false },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-12">
        <section>
          <PostForm />
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-900">Published Posts</h2>
          <div className="grid gap-6">
            {posts.map((post: Post) => (
              <div key={post.id} className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
                <h3 className="text-xl font-semibold mb-2">{post.title}</h3>
                <p className="text-gray-600 line-clamp-3">{post.content}</p>
              </div>
            ))}
            {posts.length === 0 && (
              <p className="text-gray-500 italic">No published posts yet.</p>
            )}
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-900">Drafts</h2>
          <div className="grid gap-6">
            {drafts.map((post: Post) => (
              <div key={post.id} className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 opacity-75">
                <div className="flex justify-between items-start">
                  <h3 className="text-xl font-semibold mb-2">{post.title}</h3>
                  <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">Draft</span>
                </div>
                <p className="text-gray-600 line-clamp-3">{post.content}</p>
              </div>
            ))}
            {drafts.length === 0 && (
              <p className="text-gray-500 italic">No drafts saved.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
