"use client"

import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

function Slider({
  className,
  ...props
}: SliderPrimitive.Root.Props<number>) {
  return (
    <SliderPrimitive.Root data-slot="slider" className={cn("relative flex w-full items-center", className)} {...props}>
      <SliderPrimitive.Control className="flex w-full items-center py-2 cursor-pointer">
        <SliderPrimitive.Track className="relative h-1.5 w-full grow rounded-full bg-slate-200">
          <SliderPrimitive.Indicator className="absolute h-full rounded-full bg-emerald-500" />
          <SliderPrimitive.Thumb className="size-5 rounded-full bg-white border-2 border-emerald-500 shadow-sm outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-emerald-300" />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
