import { createUniqueTargetKey } from '@shoutem/json-api-denormalizer';
import { getModificationTime } from '../../status';
import { getCollectionDescription } from '../../collection';
import _ from 'lodash';

function isItemInCollection(collection, item) {
  return collection.find(collectionItem => collectionItem.id === item.id);
}

function isSingleRelation(relationshipData) {
  return _.isPlainObject(relationshipData) || relationshipData === null;
}

function isCollection(entity) {
  return _.isArray(entity);
}

export function getUniqueTargetKey(item) {
  return createUniqueTargetKey(item);
}

export function getUniqueCollectionKey(collection) {
  const { schema, tag } = getCollectionDescription(collection);
  return `${schema}.${tag}`;
}

function isCacheValid(cachedModificationTime, currentModificationTime) {
  return cachedModificationTime >= currentModificationTime;
}

function isRioEntityUpdated(entity, cachedEntity) {
  const cachedEntityModificationTime = getModificationTime(cachedEntity);
  const currentEntityModificationTime = getModificationTime(entity);

  return isCacheValid(cachedEntityModificationTime, currentEntityModificationTime);
}

/**
 * Cache Redux input output data by 'type' and 'id'.
 * Provides methods to validate, get and resolve new data with cached data.
 */
export default class RioCache {
  constructor(getNormalizedItem) {
    this.cache = {};
    this.getNormalizedItem = getNormalizedItem;
  }

  flush() {
    this.cache = {};
  }

  getCacheByKey(itemKey) {
    return this.cache[itemKey];
  }

  cacheExists(key) {
    return this.cache.hasOwnProperty(key);
  }

  getItem(item) {
    return this.getCacheByKey(getUniqueTargetKey(item));
  }

  getCollection(collection) {
    return this.getCacheByKey(getUniqueCollectionKey(collection));
  }

  hasItem(item) {
    return this.cacheExists(getUniqueTargetKey(item));
  }

  hasCollection(collection) {
    return this.cacheExists(getUniqueCollectionKey(collection));
  }

  cacheItem(item) {
    const itemKey = getUniqueTargetKey(item);
    this.cache[itemKey] = item;
    return this.getCacheByKey(itemKey);
  }

  cacheCollection(collection) {
    const collectionKey = getUniqueCollectionKey(collection);
    this.cache[collectionKey] = collection;
    return this.getCacheByKey(collectionKey);
  }

  isItemModified(item) {
    if (!this.hasItem(item)) {
      return true;
    }
    const cachedItem = this.getItem(item);
    return !isRioEntityUpdated(item, cachedItem);
  }

  isItemCacheValid(itemDescriptor) {
    const normalizedItem = this.getNormalizedItem(itemDescriptor);
    if (this.isItemModified(normalizedItem) ||
      !this.areCachedItemRelationshipsValid(normalizedItem)) {
      return false;
    }
    return true;
  }

  isCollectionModified(collection) {
    if (!this.hasCollection(collection)) {
      return true;
    }
    const cachedCollection = this.getCollection(collection);
    return !isRioEntityUpdated(collection, cachedCollection);
  }

  isCollectionCacheValid(descriptorCollection) {
    if (this.isCollectionModified(descriptorCollection)) {
      return false;
    }
    const cachedCollection = this.getCollection(descriptorCollection);

    return !this.areCollectionItemsChanged(descriptorCollection, cachedCollection);
  }

  areCollectionItemsChanged(collection, cachedCollection = []) {
    let matchedRelationshipsItems = 0;

    const relationshipChanged = _.some(collection, item => {
      if (!isItemInCollection(cachedCollection, item) || !this.isItemCacheValid(item)) {
        return true;
      } else {
        matchedRelationshipsItems += 1;
      }
    });

    return relationshipChanged || cachedCollection.length !== matchedRelationshipsItems;
  }

  areCachedItemRelationshipsValid(item) {
    const relationshipsNames = Object.keys(item.relationships || {});

    // TODO - can relationship be removed so there is no property at all?
    // if so, new and old relationship keys must match to be valid!
    return !_.some(relationshipsNames,(relationshipName) => {
      return this.isRelationshipChanged(item, relationshipName);
    });
  }

  isRelationshipChanged(item, relationshipName) {
    const relationship = item.relationships[relationshipName].data;
    const cachedItem = this.getItem(item);
    const cachedRelationship = cachedItem[relationshipName];

    if (isSingleRelation(relationship)) {
      return !this.isItemCacheValid(relationship);
    } else if (isCollection(relationship)) {
      return this.areCollectionItemsChanged(relationship, cachedRelationship);
    }

    throw Error('Unknown relationship format!');
  }
}
