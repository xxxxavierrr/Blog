# MySQL

1. MySQL和Redis存储的区别 使用场景

区别：

```
- 数据结构：MySQL 是关系型数据库，支持结构化数据存储；Redis 是键值对存储，支持多种数据结构（字符串、哈希、列表、集合、有序集合）。
- 持久化：MySQL 支持完整的持久化；Redis 支持异步持久化（RDB、AOF）。
- 读写性能：Redis 基于内存，读写性能高（QPS 10w+）；MySQL 基于磁盘，读写性能较低（QPS 1w+）。
- 扩展性：MySQL 扩展复杂；Redis 扩展简单（集群模式）。
```

使用场景：

```
- MySQL：需要复杂查询、事务支持、数据持久化的场景。
- Redis：缓存、计数器、消息队列、实时数据分析等高性能场景。
```

2\. MySQL常用的索引（2）

主键索引：唯一标识表中的一行记录，主键字段不能为 NULL。

唯一索引：保证索引字段的值唯一，可以为 NULL。

普通索引：最基本的索引，没有任何限制。

全文索引：用于全文搜索，支持对文本内容进行分词搜索。

联合索引：多个字段组成的索引，遵循最左匹配原则。

3. 如何设置索引，手写

```sql
CREATE TABLE users (
    id INT PRIMARY KEY,
    name VARCHAR(50),
    age INT,
    email VARCHAR(100),
    INDEX idx_name (name),
    UNIQUE INDEX idx_email (email),
    FULLTEXT INDEX idx_fulltext (name, email)
);

ALTER TABLE users ADD INDEX idx_age (age);
ALTER TABLE users ADD FULLTEXT INDEX idx_fulltext_name (name);
```

4. 创建索引你会考虑哪些方面 最左匹配原理

查询频率：经常用于查询条件的字段应该创建索引。

字段区分度：区分度高的字段适合创建索引。

索引覆盖：尽量使用覆盖索引，避免回表查询。

最左匹配：联合索引遵循最左匹配原则。

5. 模糊查询怎么办，全文索引能联表查吗

模糊查询：

```
- 使用 LIKE 关键字，但如果以通配符开头（如LIKE '%abc'），则无法使用索引。
- 使用全文索引（FULLTEXT），支持高效的文本搜索。
```

索引可以在联表查询中使用，但需要确保两个表的关联字段都有索引。

6. 主键索引 聚簇索引 非聚簇索引 查询流程（2）

主键索引：唯一标识表中的一行记录，主键字段不能为 NULL。

聚簇索引：

```
- 数据行的物理顺序与索引顺序相同。
- 一个表只能有一个聚簇索引，通常是主键索引，如果没有主键则为第一个不含NULL唯一索引。
- 查询效率高，因为直接定位到数据行。
```

非聚簇索引：

```
- 索引和数据是分开存储的。
- 索引叶子节点存储的是主键值，需要通过主键值回表查询数据。
```

查询流程：

```
- 聚簇索引：直接通过索引定位到数据行。
- 非聚簇索引：先通过索引找到主键值，再通过主键值回表查询数据。
```

7\. SELECT a,b WHERE a=1,b=2 ORDER BY c DESC 应该建立什么索引  把a b颠倒还走索引吗

`CREATE INDEX idx_a_b_c ON table_name (a, b, c);`

覆盖索引包含了所有需要查询的字段（a, b, c），不需要回表查询。

如果查询条件是 WHERE b=2 AND a=1，MySQL 优化器会自动调整顺序，仍然可以使用索引。

如果查询条件是 WHERE b=2，则无法使用索引，因为不满足最左匹配原则。

8. MySQL慢查询优化（5）

分析原因：数据量太大、并发量太大、索引使用不当、SQL语句使用不当、表结构设计不当、业务设计不当、数据库服务器实例性能差

索引优化：

```
- 限制每张表索引不超过5个
- 联合索引中区分度最高/最频繁使用的字段放在最左边
- WHERE和ORDER BY/GROUP BY共同组成联合索引
```

SQL语句优化：

```
- 避免使用SELECT *等全表查询
- 多表查询中小表驱动大表
- UNION ALL代替UNION
```

表结构优化：

```
- 反范式优化，将常一起使用的字段放在一张表中，避免多表联查
- 选择能够存储数据的最小数据类型，减少字段占用空间
- 避免使用TEXT、BLOB等数据类型，如要存储大字段应使用单独扩展表
- 尽可能所有列都设为NOT NULL
- 日期存储避免使用字符串，采用时间戳
- 表字段不宜太多，冷热字段分离
```

业务优化：如分页时查第1000页数据

架构优化：读写分离、冷热分离、分库分表、缓存机制、服务器优化、数据库选型

9. 慢查询日志怎么添加

```sql
SHOW VARIABLES LIKE "slow%"
SET GLOBAL slow_query_log=1
SHOW VARIABLES LIKE "long%"
SET GLOBAL long_query_time=1
```

开启后Windows下慢日志位于C:\ProgramData\MySQL\MySQL Server 8.0\Data###-slow.log

10. 如何判断索引命中

使用 EXPLAIN 分析查询语句：`EXPLAIN SELECT * FROM users WHERE age = 30;`

key列：如果显示索引名称，则表示索引命中

rows列：值越小表示索引效果越好

type列：

```
    * const：使用唯一索引或者主键
    * eq_ref：连接多个表的查询计划中，驱动表数据是第二个表的主键或者唯一索引
    * ref：返回数据不唯一的等值查找就可能出现
    * fulltext：全文索引检索，若全文索引和普通索引同时存在时，优先选择使用全文索引
    * ref_or_null：增加了null值的比较
    * unique_subquery：用于where中的in形式子查询，子查询返回不重复值唯一值
    * index_subquery：子查询可能返回重复值，可以使用索引将子查询去重
    * range：索引范围扫描
    * index_merge：查询使用了两个以上的索引，最后取交集或者并集
    * index：索引全表扫描
    * all：全表扫描
```

`SHOW STATUS LIKE 'Handler_read%';`

Handler\_read\_key：通过索引读取的次数，值越高表示索引使用越频繁。

Handler\_read\_rnd\_next：全表扫描的次数，值越高表示索引使用越少。

11. B+树数据结构

B + 树是一种多路平衡搜索树，特点如下：

```
- 所有数据都存储在叶子节点，非叶子节点只存储索引。
- 叶子节点之间通过指针相连，形成有序链表。
- 所有叶子节点到根节点的路径长度相同。
```

B + 树适合数据库索引，因为：

```
- 磁盘读写效率高，每次读取一个磁盘页。
- 范围查询效率高，通过叶子节点的指针可以快速遍历。
```

12\. 为什么用不用红黑树和B树

不使用红黑树的原因：

```
- 红黑树是二叉树，每个节点只能有两个子节点，导致树的高度较高，磁盘 IO 次数多。
- 数据库索引数据量大，红黑树不适合存储大量数据。
```

不使用 B 树的原因：

```
- B 树的非叶子节点也存储数据，导致每个节点存储的索引数量减少，树的高度增加。
- B 树的范围查询效率低，需要中序遍历整棵树。
```

不使用跳表：

```
- 跳表内存利用率只有2/3，相比B+树层数较高，因此在层之间遍历磁盘IO次数较多
- 跳表可能在第一层也可能在最后一层查到数据，稳定性差
- B+树上行锁只用给那一个数据节点上锁，而跳表要联动好几层都要上锁，耗时过久
```

13\. MySQL为什么用B+树做索引 磁盘页多大

使用 B + 树的原因：

```
- 磁盘读写效率高：B + 树的每个节点可以存储多个索引，减少树的高度，降低磁盘 IO 次数。
- 范围查询效率高：叶子节点之间有指针相连，便于范围查询。
- 全节点利用率高：所有数据都存储在叶子节点，非叶子节点只存储索引，提高了空间利用率。
```

磁盘页大小：

```
- InnoDB 存储引擎的默认页大小是 16KB，可以通过innodb_page_size参数修改。
- 磁盘IO以页为单位进行，B+树的一个节点通常对应一个磁盘页。
```

14\. InnoDB、MyISAM区别（2） 使用场景

区别：

```
- 事务支持：InnoDB 支持事务；MyISAM 不支持。
- 外键支持：InnoDB 支持外键；MyISAM 不支持。
- 聚簇索引：InnoDB 使用聚簇索引；MyISAM 使用非聚簇索引。
- 并发性能：InnoDB 支持行级锁；MyISAM 只支持表级锁。
- 崩溃恢复：InnoDB 支持崩溃恢复；MyISAM 不支持。
```

使用场景：

```
- InnoDB：需要事务支持、外键约束、高并发的场景（如电商、金融）。
- MyISAM：读多写少、不需要事务支持的场景（如日志记录、静态数据）。
```

15\. MySQL模块

MySQL 架构模块：

```
- 连接器：负责与客户端建立连接，验证身份，管理连接状态。
- 查询缓存：缓存查询结果，提高查询效率（MySQL 8.0 已移除）。
- 分析器：对 SQL 语句进行词法和语法分析。
- 优化器：选择最优的执行计划（如选择索引、表连接顺序）。
- 执行器：根据执行计划执行 SQL 语句，调用存储引擎的 API。
- 存储引擎：负责数据的存储和检索（如 InnoDB、MyISAM）。
- 集群服务器：提供高可用和扩展性（如 MySQL Cluster、Group Replication）。
```

16\. 索引下推

<font style="color:rgba(0, 0, 0, 0.85) !important;">在索引遍历过程中，对索引中包含的字段先做判断，过滤掉不满足条件的记录，减少回表次数。</font>

<font style="color:rgba(0, 0, 0, 0.85) !important;">MySQL 5.6 引入的优化技术，只适用于二级索引。</font>

<code><font style="color:rgba(0, 0, 0, 0.85) !important;">SELECT * FROM users WHERE name LIKE '张%' AND age > 20;</font></code>

<font style="color:rgba(0, 0, 0, 0.85) !important;">没有索引下推：先通过索引找到所有姓张的记录，再回表查询 age 字段进行过滤。</font>

<font style="color:rgba(0, 0, 0, 0.85) !important;">有索引下推：在索引中直接过滤 age > 20 的记录，只回表查询满足条件的记录。</font>

17. MySQL事务等级

READ UNCOMMITTED（读未提交）：允许读取未提交的数据变更，可能导致脏读、不可重复读、幻读。

READ COMMITTED（读已提交）：允许读取已提交的数据，避免脏读，但可能导致不可重复读和幻读。

REPEATABLE READ（可重复读）：MySQL 默认级别，确保同一事务中多次读取同一数据的结果一致，避免脏读和不可重复读，但可能导致幻读。

SERIALIZABLE（串行化）：强制事务串行执行，避免所有并发问题，但性能最低。

18. 数据库如何保证事务性ACID（2）

原子性（Atomicity）：通过undo log 实现，记录事务执行前的数据状态，回滚时恢复。

一致性（Consistency）：通过AID实现。

隔离性（Isolation）：通过锁机制和MVCC（多版本并发控制）实现。

持久性（Durability）：通过redo log实现，事务提交时将redo log写入磁盘，保证数据不丢失。

19. undolog redolog binlog

undo log：

```
- 记录事务执行前的数据状态，用于回滚操作。
- 保证事务的原子性。
```

redo log：

```
- 记录事务对数据页的修改，用于崩溃恢复。
- 保证事务的持久性。
```

binlog：

```
- 记录数据库的逻辑变更（如 SQL 语句），用于主从复制和数据恢复。
- 是一种逻辑日志，与存储引擎无关。
```

20\. undolog链表放在哪

undo log 记录指针存储在数据页中，与数据一起存储。undo log 的链表结构存储在回滚段（rollback segment）中，回滚段位于系统表空间（system tablespace）或独立的 undo 表空间中。

21. redolog\&binlog区别

写入时机：redolog在事务执行过程中不断写入；binlog在事务提交时一次性写入

存储引擎：redolog为InnoDB 独有；binlog为所有存储引擎共享

用途：redolog负责崩溃恢复；binlog负责主从复制、数据恢复

日志格式：redolog循环写入，空间固定；binlog追加写入，日志文件不断增长

22. redolog写满怎么办

当 redo log 写满时，InnoDB 会采取以下措施：

```
- 暂停所有 DML 操作，等待后台线程将脏页刷新到磁盘。
- 后台线程会将 redo log 中已持久化到磁盘的数据页对应的 redo log 标记为可覆盖。
- 当有足够的空间时，继续写入 redo log。
```

如果 redo log 持续写满，可能会导致数据库性能下降甚至阻塞。

23. redolog写磁盘频率

innodb\_flush\_log\_at\_trx\_commit=0：

每秒将 redo log buffer 写入磁盘并刷新一次，性能最高，但可能丢失 1 秒内的数据。

innodb\_flush\_log\_at\_trx\_commit=1：

每次事务提交时将 redo log buffer 写入磁盘并刷新，保证不丢失数据，但性能最低。

innodb\_flush\_log\_at\_trx\_commit=2：

每次事务提交时将 redo log buffer 写入磁盘，但每秒刷新一次，性能和安全性介于 0 和 1 之间。

24. binlog怎么保证原子性

binlog 通过两阶段提交（Two-Phase Commit，2PC）保证事务原子性：

准备阶段：事务执行完成后，InnoDB 将 redo log 写入磁盘，状态标记为 "prepare"。

提交阶段：MySQL 将 binlog 写入磁盘，然后 InnoDB 将 redo log 状态标记为 "commit"。

25. MVCC原理（2）

MVCC（多版本并发控制）是一种并发控制机制，通过保存数据的多个版本，实现事务的隔离性。在 InnoDB 中，MVCC 通过 undo log 和 Read View 实现。

原理：

每行数据增加两个隐藏列：

```
    * DB_TRX_ID：记录最后修改该行数据的事务 ID。
    * DB_ROLL_PTR：指向该行数据的 undo log 记录。
```

Read View：

```
    * 事务在启动时生成一个 Read View，包含当前活跃的事务 ID 列表。
    * 事务在读取数据时，根据 Read View 判断数据版本的可见性。
```

26\. MySQL可以恢复到精确某一秒说法对吗 要恢复怎么操作

恢复前提：

```
- 存在数据库数据备份
- binlog日志完整
```

恢复步骤：

```
- 确定恢复时间点，找到最近的数据库备份
- 使用 mysqlbinlog 工具提取备份时间点到恢复时间点的 binlog：
```

```bash
mysqlbinlog --start-datetime="2023-01-01 11:00:00" --stop-datetime="2023-01-01 12:00:00" /var/log/mysql/binlog.000001 > /tmp/restore.sql
mysql -u root -p < /tmp/restore.sql
```

27. 乐观悲观锁

悲观锁：

```
- 认为并发冲突一定会发生，因此在操作数据前先加锁，确保其他事务不能修改数据。
- 实现方式：数据库的行锁、表锁。
```

乐观锁：

```
- 认为并发冲突很少发生，因此在操作数据时不加锁，而是在提交时检查数据是否被其他事务修改。
- 实现方式：版本号机制、时间戳机制。
```

28\. FOR UPDATE 100ms 不加 1ms 原因 反过来 当前读 快照读

原因：

```
- FOR UPDATE：使用当前读，读取最新的数据并加行锁，可能需要等待其他事务释放锁，因此耗时较长（100ms）。
- 不加 FOR UPDATE：使用快照读，读取事务启动时的版本，无需等待锁，因此耗时较短（1ms）。
```

反过来原因：优化器问题

当前读与快照读：

```
- 当前读：读取最新的数据，加锁保证数据一致性（如 SELECT ... FOR UPDATE）。
- 快照读：读取事务启动时的版本，不加锁，通过 MVCC 实现（如普通 SELECT）。
```

29\. 字符串可以作为主键吗

可以，但需要注意：

```
- 长度限制：InnoDB 表的主键长度不能超过 767 字节（MySQL 5.6 及以下）或 3072 字节（MySQL 5.7 及以上）。
- 性能影响：字符串作为主键会比整数主键占用更多空间，且比较效率较低。
- 有序性：建议使用有序的字符串（如 UUID 有序化）作为主键，避免随机插入导致的页分裂问题。
```

30\. 手写SQL语句（SELECT，GROUP，COUNT）

`SELECT COUNT(*) AS order_count FROM orders GROUP BY user_id HAVING COUNT(*) > 3;`

31. SQL排序怎么写 order by asc desc

`SELECT * FROM users ORDER BY age DESC, name ASC;`

32. SQL查不重复字段 distinct

`SELECT DISTINCT age, gender FROM users;`

`SELECT COUNT(DISTINCT age) FROM users;`


> 更新: 2025-08-26 19:36:24  
> 原文: <https://www.yuque.com/yunzishuo-b4wkj/op8mqg/ts1odr7fbb190gx2>