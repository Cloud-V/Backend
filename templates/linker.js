module.exports = {
    arm: `MEMORY
{
rom(RX)   : ORIGIN = 0x00000000, LENGTH = 0x00100000
ram(WAIL) : ORIGIN = 0x40000000, LENGTH = 0x00100000
}
ENTRY(Reset_Handler)

SECTIONS
{
.text : {
    KEEP(*(.isr_vector))
    *(.text*)
    *(.rodata*)
} > rom
.bss :
{
    . = ALIGN(4);
    __bss_start__ = .;
    *(.bss*)
    *(COMMON)
    . = ALIGN(4);
    __bss_end__ = .;
} > ram

.data : { *(.data*) } > ram
.stack_dummy (COPY):
{
    *(.stack*)
} > ram

__StackTop = ORIGIN(ram) + LENGTH(ram);
__StackLimit = __StackTop - SIZEOF(.stack_dummy);
}`,
    riscv: `ENTRY(start)

MEMORY {
   ram (rwx) : ORIGIN = 0x00000000, LENGTH = 0x00002000
}

SECTIONS {
   .ram : {
       start.o(.text);
       *(.text);
       *(.data);
       *(.rodata);

       . = ALIGN(4);
       bss_start = .;

       *(.bss);

       . = ALIGN(4);
       bss_end = .;
   } > ram
}`,
    blank: ``
}
