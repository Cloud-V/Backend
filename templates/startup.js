module.exports = {
    arm: `.syntax unified
.arch armv6-m


.section .stack
.align 3
.equ    Stack_Size, 0x400
.globl    __StackTop
.globl    __StackLimit

__StackLimit:
.space    Stack_Size
.size __StackLimit, . - __StackLimit
__StackTop:
.size __StackTop, . - __StackTop


.section .heap
.align 3

.equ    Heap_Size, 0
.globl    __HeapBase
.globl    __HeapLimit
__HeapBase:
.if    Heap_Size
.space    Heap_Size
.endif
.size __HeapBase, . - __HeapBase
__HeapLimit:
.size __HeapLimit, . - __HeapLimit


/* Vector Table */

.section .isr_vector
.align 2
.globl __isr_vector
__isr_vector:
.long   __StackTop                  /* Top of Stack                  */
.long   Reset_Handler               /* Reset Handler                 */
.long   0                           /* NMI Handler                   */
.long   0                           /* Hard Fault Handler            */
.long   0                           /* Reserved                      */
.long   0                           /* Reserved                      */
.long   0                           /* Reserved                      */
.long   0                           /* Reserved                      */
.long   0                           /* Reserved                      */
.long   0                           /* Reserved                      */
.long   0                           /* Reserved                      */
.long   0                           /* SVCall Handler                */
.long   0                           /* Debug Monitor Handler         */
.long   0                           /* Reserved                      */
.long   0                           /* PendSV Handler                */
.long   0                           /* SysTick Handler               */

/* External Interrupts */
.long   0
.long   0
.long   0
.long   0
.long   0
.long   0
.long   0
.long   0
.long   0
.long   0
.long   0
.long   0
.long   0
.long   0
.long   0
.long   0

.size    __isr_vector, . - __isr_vector

/* Reset Handler */
.text
.thumb
.thumb_func
.align 2
.globl    Reset_Handler
.type    Reset_Handler, %function
Reset_Handler:
ldr    r1, =0xE000E100
ldr    r0, =0x00000001
str    r0, [r1]

// Initialise core registers to avoid problems with X in simulation
mov r4, r0
mov r5, r0
mov r6, r0
mov r7, r0
mov r8, r0
mov r9, r0
bl      main

.pool
.size Reset_Handler, . - Reset_Handler

/*    Macro to define default handlers. Default handler
*    will be weak symbol and just dead loops. They can be
*    overwritten by other handlers */
.macro    def_default_handler    handler_name
.align 1
.thumb_func
.weak    \handler_name
.type    \handler_name, %function
\handler_name :
b    .
.size    \handler_name, . - \handler_name
.endm


def_default_handler     UART_Handler



.end
`,
    riscv: `.extern bss_start
.extern bss_end

.global start
start:
   la t0, bss_start
   la t1, bss_end

   beq t0, t1, clear_bss_done
clear_bss:
   sw zero, 0(t0)
   addi t0, t0, 4
   bne t0, t1, clear_bss
clear_bss_done:

   la sp, stack_top
   call main
   j .

.set Stack_Size, 1024
.section bss
.local stack_bottom
.comm stack_bottom, Stack_Size, 16
stack_top:
`,
    blank: ``,
};
