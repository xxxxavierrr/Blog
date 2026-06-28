## 内存计算
1. float32：
	1. 全精度 
	2. 1+8+23
	3. element_size * 4
2. float16：×
	1. 半精度，大型模型精度不够
	2. 1+5+10
3. bfloat16：
	1. 1+8+7
	2. float32的表示范围
	3. float16的内存占用
	4. 分辨率稍低
4. fp8：
	1. 1+4+3 / 1+5+2
5. 混合精度训练：
	1. 长时间高精度：float32
	2. 临时（如前向传播）：bf16
	3. 推理可比训练更为激进
6. 张量存储：
	1. 向量指向内存空间
	2. 内存空间连续存放，张量存储各维度步长
		1.  text("To go to the next row (dim 0), skip 4 elements in storage.")
		    assert x.stride(0) == 4
		    text("To go to the next column (dim 1), skip 1 element in storage.")
		    assert x.stride(1) == 1
		2. 计算获取index获取浮点数
	3. 获取view，某一行/列，转置不会复制新张量
	4. 连续存储才可创建view
		1. contiguous() : copy
		2. reshape：copy
7. 张量乘法：
	1. x = torch.ones(4, 8, 16, 32)
		w= torch.ones(32, 2)
		y = x @ w       (4,8,16,2)
8. einops:
	1. 乘法
	```python
	x: Float[torch.Tensor, "batch seq1 hidden"] = torch.ones(2, 3, 4)  # @inspect x
	y: Float[torch.Tensor, "batch seq2 hidden"] = torch.ones(2, 3, 4)  # @inspect y
	
	text("Old way:")
	z = x @ y.transpose(-2, -1)  # batch, sequence, sequence  @inspect z
	
	text("New (einops) way:")
	z = einsum(x, y, "batch seq1 hidden, batch seq2 hidden -> batch seq1 seq2")  # @inspect z
	z = einsum(x, y, "... seq1 hidden, ... seq2 hidden -> ... seq1 seq2")  # @inspect z
	```
	2. 单维度聚合
		1.  y = reduce(x, "... hidden -> ...", "sum")
	3. 拆开&展平
		1. x = rearrange(x, "... (heads hidden1) -> ... heads hidden1", heads=2)  # @inspect x
		2. x = rearrange(x, "... heads hidden2 -> ... (heads hidden2)")  # @inspect x
9. 计算成本
	1. FLOP：浮点运算
	2. 稠密FLOP/s ≈ 稀疏FLOP/s  / 2
		1. 稀疏：张量大部分数据为0
	3. H100集群（8台）一周FLOP ≈ 4.7e21
10. 线性模型FLOP
	1. [A,B]@[B,C] = [A,C]
		1. 对于每对(i, j, k)进行相乘，乘完相加
		2. FLOP=2 * A * B * C
	2. 矩阵乘法最耗时，计算成本可忽略其他操作
	3. A：数据总数  B&C：w参数
		1. 前向传播FLOP ≈ 2 * token * w_parameter
11. MFU：模型浮点计算利用率
	1. 实际FLOP/s  /  理想FLOP/s
	2. MFU>50% ✔（通信传输耗时）
12. 梯度计算
	1. x --w1--> h1 --w2--> h2 -> loss
		1. x: [B,D] h1:[B,D] h2:[B,K]
		2. h2.grad = ∂loss / ∂h2（损失函数）
		3. w2.grad = h1T ​@ h2.grad
			1. ![[CS336 02 Pytorch实现LLM.png|280]]
			2. 底层：w2.grad[j,k]=∑i​h1​[i,j]⋅h2.grad[i,k]
				1. 梯度的定义是「损失函数对每个权重元素的偏导数」
					1. w2.grad.size = w2.size
				2. h2​[i,k]=∑ j′​h1​[i,j′]⋅w2​[j′,k]
				3. ∂w2​[j,k] / ∂h2​[i,k]​=h1​[i,j]
				4. ![[CS336 02 Pytorch实现LLM-1.png|291]]
			3. w2.grad FLOP = 2 * B * D * K
		4. h1.grad = h2.grad @ w2T​
			1. h1.grad FLOP = 2 * B * D * K
		5. w1.grad = h1.grad @ xT
			1. w1.grad FLOP = 2 * B * D * D
		6. x.grad FLOP = 2 * B * D * D
	2. 前向传播为参数量2倍
	3. 反向传播为参数量4倍

## 模型
1. 参数初始化
	1. x:[A,B] w:[B,C] x@w=h
		1. 若x_mean，w_mean标准差均为 根号5
		2. x@w即 B个浮点数相乘
		3. 方差为B * x_mean * w_mean 
		4. h_mean = 5B开根
		5. 易参数爆炸
	2. Xavier初始化：
		1. w先做正态分布采样
		2. 除根号B消除参数爆炸
	3. 额外防护：区间截断
2. 设计结构
3. 训练：
	1. 设置随机种子
4. 数据加载：
	1. np.memmap
5. 优化器
	1. BGD：w=w−lr×w.grad
	2. SGD：BGD取随机小批量样本
	3. 动量：SGD，grad含历史grad
		1. v=β⋅v+(1−β)⋅grad
		2. w=w−lr⋅v
		3. β一般0.9
	4. Adagrad：SDG，grad取 当前grad/历史平方和开根
		1. ![[CS336 02 Pytorch实现LLM-2.png|369]]
	5. RMSgrad：Adagrad，历史梯度平方和的累加改为动量形式，防止学习率降为0
	6. Adam：RMSgrad+动量
		1. ![[CS336 02 Pytorch实现LLM-3.png|273]]
		2. 动量：保证单梯度参数惯性
		3. 平方和：防止梯度矩阵内参数差异过大
	7. Muon：仅保留动量，对动量矩阵做正交保证参数差异变小
6. 参数量统计：
	1. 以layers个D * D全连接层 + 1个投影层为例
	2. w参数量：(D * D * num_layers) + D
	3. 激活层（前向结果）：B * D * num_layers
	4. grad：等于w参数量（中间激活层grad不用更新，因此计算完可丢）
	5. 优化器：保存梯度平方，等于w参数量（Adam两倍）
7. checkpoint：
	1. 模型参数
	2. 优化器参数