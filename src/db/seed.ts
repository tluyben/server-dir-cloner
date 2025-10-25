import { db, users, posts, products } from './index.js';

async function seed() {
  console.log('Seeding database...');

  try {
    const insertedUsers = await db
      .insert(users)
      .values([
        { email: 'john@example.com', name: 'John Doe' },
        { email: 'jane@example.com', name: 'Jane Smith' },
        { email: 'bob@example.com', name: 'Bob Johnson' },
      ])
      .returning();

    console.log(`Inserted ${insertedUsers.length} users`);

    await db
      .insert(posts)
      .values([
        {
          title: 'Getting Started with Express 5',
          content: 'Express 5 brings many improvements and new features...',
          slug: 'getting-started-express-5',
          authorId: insertedUsers[0].id,
          published: true,
          publishedAt: new Date().toISOString(),
        },
        {
          title: 'TypeScript Best Practices',
          content: 'Learn how to write better TypeScript code...',
          slug: 'typescript-best-practices',
          authorId: insertedUsers[1].id,
          published: true,
          publishedAt: new Date().toISOString(),
        },
        {
          title: 'Draft Post',
          content: 'This is a draft post not yet published...',
          slug: 'draft-post',
          authorId: insertedUsers[0].id,
          published: false,
        },
      ])
      .returning();

    await db
      .insert(products)
      .values([
        {
          name: 'Premium Widget',
          description: 'High-quality widget for all your needs',
          price: 99.99,
          stock: 50,
          sku: 'WDG-001',
          category: 'Widgets',
        },
        {
          name: 'Basic Gadget',
          description: 'Essential gadget for everyday use',
          price: 29.99,
          stock: 100,
          sku: 'GDG-001',
          category: 'Gadgets',
        },
        {
          name: 'Pro Tool',
          description: 'Professional-grade tool',
          price: 199.99,
          stock: 25,
          sku: 'TL-001',
          category: 'Tools',
        },
      ])
      .returning();

    console.log('Database seeded successfully!');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

seed();
