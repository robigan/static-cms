import { CONFIG_SUCCESS } from '../actions/config';

import type { ConfigAction } from '../actions/config';
import type { Collection, Collections } from '../interface';

export type CollectionsState = Collections;

const defaultState: CollectionsState = {};

function collections(
  state: CollectionsState = defaultState,
  action: ConfigAction,
): CollectionsState {
  switch (action.type) {
    case CONFIG_SUCCESS: {
      const collections = action.payload.collections;
      return collections.reduce((acc, collection) => {
        acc[collection.name] = collection as Collection;
        return acc;
      }, {} as Record<string, Collection>);
    }
    default:
      return state;
  }
}

export default collections;
