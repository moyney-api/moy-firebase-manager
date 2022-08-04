import { firestore } from 'firebase-admin';

export class MoyFirestoreMock {
  private db: { [db: string]: any };
  private fs = firestore();

  constructor(private readonly MOCK_DB_TO_USE: { [db: string]: any }) {
    this.db = this.MOCK_DB_TO_USE;
    this.spyOnBatch();
    this.spyOnDoc();
    this.spyOnCollection();
  }

  get(id: string): any {
    return this.db.bags[id];
  }

  reset(): void {
    this.db = this.deepCopy(this.MOCK_DB_TO_USE);
  }

  private spyOnDoc = (): jest.SpyInstance => {
    return jest.spyOn(this.fs, 'doc').mockImplementation((wholePath: string) => {
      return this.getObjectRerferenceForPath(wholePath, this.db);
    });
  }

  private spyOnCollection = (): jest.SpyInstance => {
    return jest.spyOn(this.fs, 'collection').mockImplementation((collection: string): any => {
      const dbCollection = (<any>this.db)[collection];
      return {
        where: (prop: string, operator: 'in', values: string[]) => ({
          get: (): any => {
            return new Promise(
              (resolves) => resolves({
                docs: Object.keys(dbCollection).reduce((results, uid: string) => {
                  if (values.includes(dbCollection[uid][prop])) {
                    results.push({ id: uid, data: () => this.deepCopy(dbCollection[uid]) });
                  }
                  return results;
                }, [] as any[])
              })
            );
          }
        }),
      }
    });
  }

  private spyOnBatch = (): jest.SpyInstance => {
    return jest.spyOn(this.fs, 'batch').mockImplementation(() => {
      const batchInstance: any = {
        __changes: this.deepCopy(this.db),
        commit: () => {
          return new Promise<void>((resolves) => {
            this.db = batchInstance.__changes;
            resolves();
          });
        },
        set: (doc: { id: string; path: string; data: () => any }, value: any) => {
          const ref = this.getObjectRerferenceForPath(doc.path, batchInstance.__changes).__result;

          for (let parentKey in value) {
            const splittedKeys = parentKey.split('.');
            splittedKeys.reduce((obj, _key, index) => {
              if ((splittedKeys.length - 1) <= index) {
                obj[_key] = value[parentKey];
                return;
              }

              if (!obj[_key]) obj[_key] = {};
              return obj[_key];
            }, ref);
          }
        },
      };

      return batchInstance;
    });
  }

  // todo: separate this into its own class
  private getObjectRerferenceForPath = (path: string, from: { [property: string]: any }): any => {
    let id = '';
    const splitted = path.split('/');

    const resultingData = splitted.reduce((result, _path) => {
      if (result[_path]) {
        result[_path] = { ...result[_path] };
        id = _path;
      } else {
        throw new Error('User does not exist');
      }
      return result[_path];
    }, from);

    return {
      id,
      path,
      get() {
        return new Promise((resolves) => {
          resolves({ id, path, data: () => resultingData });
        });
      },
      __result: resultingData,
    }
  }

  private deepCopy<T>(db: T): T {
    return Object.keys(db).reduce((built, key) => {
      if (typeof built[key] === 'object') {
        built[key] = this.deepCopy(built[key]);
      }
      return built;
    }, { ...db } as any);
  }
}
