import {Logger} from 'winston'
import {OkPacket, Pool} from 'mysql'
import {WinstonUtil} from './winstonUtil'
import {EnvLoader} from './envLoader'
import StrUtil from "./strUtil";
import pg from "pg-promise/typescript/pg-subset";
import {IDatabase} from "pg-promise";


export class PgUtil {
  private static log: Logger = WinstonUtil.newLog('pg')
  static logSql = false
  static pool:IDatabase<{}, pg.IClient>; // todo unknown type ???

  public static init(pool:IDatabase<{}, pg.IClient>) {
    PgUtil.pool = pool;
    if (!PgUtil.logSql && EnvLoader.getPropertyAsBool('LOG_SQL_STATEMENTS')) {
      // todo add logging query + values
      PgUtil.logSql = true
    }
    this.log.info('sql statement logging is enabled')
  }

  public static async queryOneValueOrDefault<V>(
    query: string,
    defaultValue: V,
    ...sqlArgs: any[]
  ): Promise<V | null> {
    const result = await this.queryOneRow(query, ...sqlArgs)
    if (result == null) {
      return defaultValue
    }
    const firstPropertyName = Object.entries(result)[0][0]
    if (firstPropertyName == null) {
      return defaultValue
    }
    const resultValue = result[firstPropertyName]
    if (resultValue == null) {
      return defaultValue
    }
    return resultValue
  }

  public static async queryOneValue<V>(query: string, ...sqlArgs: any[]): Promise<V | null> {
    return await this.queryOneValueOrDefault(query, null, ...sqlArgs)
  }

  public static async queryOneRow<R>(query: string, ...sqlArgs: any[]): Promise<R | null> {
    const result = await this.queryArr<R>(query, ...sqlArgs)
    if (result.length != 1) {
      return null
    }
    return result[0]
  }

  public static async queryAnyArr(query: string, ...sqlArgs: any[]): Promise<any[]> {
    return await this.queryArr<any>(query, ...sqlArgs)
  }

  public static async update(query: string, ...sqlArgs: any[]): Promise<number> {
    query = StrUtil.replaceAllMySqlToPostre(query);
    this.log.debug(query, '     ---> args ', sqlArgs);
    let result = await this.pool.result<number>(query, sqlArgs,r => r.rowCount);
    return result;
  }

  public static async insert(query: string, ...sqlArgs: any[]): Promise<number> {
    query = StrUtil.replaceAllMySqlToPostre(query);
    this.log.debug(query, '     ---> args ', sqlArgs);
    let result = await this.pool.result<number>(query, sqlArgs,r => r.rowCount);
    return result;
  }

  public static async queryArr<R>(query: string, ...sqlArgs: any[]): Promise<R[]> {
    query = StrUtil.replaceAllMySqlToPostre(query);
    this.log.debug(query, '     ---> args ', sqlArgs);
    let result = await this.pool.query<R[]>(query, sqlArgs);
    return result;
  }

}

/*
function (err, connection) {
        if (err) {
          PgUtil.log.error(err)
          reject(err)
          return
        }
        connection.query(query, sqlArgs, function (err, results) {
          connection.release() // always put connection back in pool after last query
          if (err) {
            PgUtil.log.error(err)
            reject(err)
            return
          }
          resolve(results)
          return
        })
      }
*/
