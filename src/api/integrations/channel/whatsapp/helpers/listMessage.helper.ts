import { proto } from 'baileys';

export function normalizeListType(listMessage?: proto.Message.IListMessage | null): void {
  if (listMessage?.listType !== proto.Message.ListMessage.ListType.PRODUCT_LIST) {
    return;
  }

  // Keep a real catalog product list. Rewrite only mis-tagged SINGLE_SELECT lists
  // that were sent as PRODUCT_LIST without productListInfo.
  if (listMessage.productListInfo) {
    return;
  }

  listMessage.listType = proto.Message.ListMessage.ListType.SINGLE_SELECT;
}
