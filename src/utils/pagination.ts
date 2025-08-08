import { prisma } from "../lib/prisma";

interface PaginateOptions {
  page: number;
  pageSize: number;
}

export async function paginate<
  Delegate extends {
    findMany(args?: FindManyArgs): Promise<ItemType[]>;
    count(args?: { where?: unknown }): Promise<number>;
  },
  FindManyArgs extends { where?: unknown },
  ItemType
>(model: Delegate, findManyArgs: FindManyArgs, options: PaginateOptions) {
  const { page, pageSize } = options;
  const skip = (page - 1) * pageSize;
  const take = pageSize;

  const [items, total] = await prisma.$transaction(async () => {
    const items = await model.findMany({ ...findManyArgs, skip, take });
    const total = await model.count({ where: findManyArgs.where });
    return [items, total] as const;
  });

  const pageCount = Math.ceil(total / pageSize);

  return {
    items: items as ItemType[],
    meta: {
      total,
      page,
      pageSize,
      pageCount,
    },
  };
}
