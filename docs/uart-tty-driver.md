# UART TTY 驱动技术文档

## 背景

为 SG2002 平台新增 `/dev/ttyS1` (UART1) 和 `/dev/ttyS2` (UART2) 串口 TTY 设备。在调测过程中发现并修复了两个关键 Bug。

---

## Bug 1：Pinmux 未配置，信号无法输出

**现象**：`write()` 调用返回成功，寄存器层面数据已写入，但物理引脚上无实际信号输出。

**根因**：UART 引脚默认复用为其他功能，未切换到 UART 模式：
- UART1 的引脚 (`JTAG_CPU_TMS` / `JTAG_CPU_TCK`) 默认为 JTAG 功能
- UART2 的引脚 (`PWR_GPIO0` / `PWR_GPIO1`) 默认为 GPIO 功能

**修复**：在设备构造阶段调用 `pinmux.set_uart1()` / `pinmux.set_uart2()`，将引脚切换到 UART 模式。同时在 sg200x-bsp pinmux 驱动中新增了 `Pinmux::set_uart2()` 接口。

---

## Bug 2：IRQ 上下文中的 Mutex 死锁

**现象**：系统运行时触发 `"tried to acquire mutex it already owns"` panic。

**根因**：RX 环形缓冲区使用 `axsync::Mutex`（睡眠锁）保护。当中断触发时，若用户态任务已持有该锁，IRQ handler 在同一 CPU 上再次尝试获取同一把锁，触发自死锁。

**修复**：将 `axsync::Mutex` 替换为 `kspin::SpinNoIrq`。该锁在持有时关闭本地 CPU 中断，确保 IRQ handler 不会在锁被持有时抢占执行，从根本上消除死锁。

---

## 遗留风险

`cvi_camera.rs` 中的 `CAMERA_UART_BUF` 存在相同的 IRQ-vs-Mutex 隐患，本次提交未处理，后续需排查。
