import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragOverlay,
    type DragEndEvent,
    type DragStartEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    useSortable,
    horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import type { Modifier } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { useState } from "react";
import { rgbChannelConfig } from "@/constants/colors";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AppPalette } from "@/queries/palettes";
import {
    cosineGradient,
    applyGlobals,
} from "@repo/data-ops/gradient-gen/cosine";
import type * as v from "valibot";
import { coeffsSchema } from "@repo/data-ops/valibot-schema/grabient";
import { setIsDragging } from "@/stores/ui";

type CosineCoeffs = v.InferOutput<typeof coeffsSchema>;

type RGBTab = {
    id: string;
    label: string;
    color: string;
    value: number;
    originalIndex: number;
};

const restrictToContainer: Modifier = ({
    transform,
    draggingNodeRect,
    containerNodeRect,
}) => {
    if (!draggingNodeRect || !containerNodeRect) {
        return transform;
    }

    const containerLeft = containerNodeRect.left;
    const containerRight = containerNodeRect.right;
    const draggingLeft = draggingNodeRect.left + transform.x;
    const draggingRight = draggingNodeRect.right + transform.x;

    let x = transform.x;

    if (draggingLeft < containerLeft) {
        x = containerLeft - draggingNodeRect.left;
    } else if (draggingRight > containerRight) {
        x = containerRight - draggingNodeRect.right;
    }

    return {
        x,
        y: 0,
        scaleX: 1,
        scaleY: 1,
    };
};

interface SortableTabProps {
    id: string;
    color: string;
    label: string;
    align: "start" | "center" | "end";
}

interface RGBTabsProps {
    palette: AppPalette;
    onOrderChange?: (coeffs: CosineCoeffs, palette: AppPalette) => void;
}

function SortableTab({ id, color, label, align }: SortableTabProps) {
    const [tooltipOpen, setTooltipOpen] = useState(false);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id,
        animateLayoutChanges: () => false,
    });

    const adjustedTransform = transform ? { ...transform, y: 0 } : null;

    const style = {
        transform: adjustedTransform
            ? CSS.Transform.toString(adjustedTransform)
            : undefined,
        transition,
        backgroundColor: color,
        opacity: isDragging ? 0 : 1,
        zIndex: isDragging ? 1 : 0,
    };

    return (
        <Tooltip
            delayDuration={1000}
            open={isDragging ? false : tooltipOpen}
            onOpenChange={setTooltipOpen}
        >
            <TooltipTrigger asChild>
                <div
                    ref={setNodeRef}
                    style={style}
                    className="w-9 h-5 rounded-md shadow-sm flex items-center justify-start pl-1.5 cursor-grab relative"
                    aria-label={`Drag ${label} channel to reorder`}
                    suppressHydrationWarning
                    {...attributes}
                    {...listeners}
                >
                    <div className="absolute inset-0 -m-2" />
                    <GripVertical size={10} className="text-white/80" />
                </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" align={align} sideOffset={6}>
                <p>{label}</p>
            </TooltipContent>
        </Tooltip>
    );
}

export function RGBTabs({ palette, onOrderChange }: RGBTabsProps) {
    const [activeId, setActiveId] = useState<string | null>(null);

    const { coeffs, globals } = palette;
    const processedCoeffs = applyGlobals(coeffs, globals);

    const gradientSteps = 10;
    const colors = cosineGradient(gradientSteps, processedCoeffs);

    const channelTotals = colors.reduce(
        (totals, color) => [
            totals[0]! + (color[0] ?? 0),
            totals[1]! + (color[1] ?? 0),
            totals[2]! + (color[2] ?? 0),
        ],
        [0, 0, 0],
    );

    const unsortedTabs: RGBTab[] = [
        {
            id: "red",
            color: rgbChannelConfig.red.color,
            label: rgbChannelConfig.red.label,
            value: channelTotals[0]!,
            originalIndex: 0,
        },
        {
            id: "green",
            color: rgbChannelConfig.green.color,
            label: rgbChannelConfig.green.label,
            value: channelTotals[1]!,
            originalIndex: 1,
        },
        {
            id: "blue",
            color: rgbChannelConfig.blue.color,
            label: rgbChannelConfig.blue.label,
            value: channelTotals[2]!,
            originalIndex: 2,
        },
    ];

    const sortedTabs = [...unsortedTabs].sort((a, b) => b.value - a.value);

    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 3,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 100,
                tolerance: 8,
            },
        }),
        useSensor(KeyboardSensor),
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
        setIsDragging(true);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveId(null);
        setIsDragging(false);

        const { active, over } = event;

        if (over && active.id !== over.id && onOrderChange) {
            const oldIndex = sortedTabs.findIndex(
                (item) => item.id === active.id,
            );
            const newIndex = sortedTabs.findIndex(
                (item) => item.id === over.id,
            );

            const sourceTab = sortedTabs[oldIndex];
            const targetTab = sortedTabs[newIndex];

            if (!sourceTab || !targetTab) return;

            const newCoeffs = coeffs.map((coeff) => {
                const [r, g, b, a = 1] = coeff;
                const newCoeff = [r, g, b, a];

                const temp = newCoeff[sourceTab.originalIndex]!;
                newCoeff[sourceTab.originalIndex] =
                    newCoeff[targetTab.originalIndex]!;
                newCoeff[targetTab.originalIndex] = temp;

                return newCoeff;
            }) as CosineCoeffs;

            onOrderChange(newCoeffs, palette);
        }
    };

    const tabOrderKey = sortedTabs.map((tab) => tab.id).join("-");

    return (
        <DndContext
            key={tabOrderKey}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToHorizontalAxis, restrictToContainer]}
            autoScroll={false}
        >
            <SortableContext
                items={sortedTabs.map((tab) => tab.id)}
                strategy={horizontalListSortingStrategy}
            >
                <div className="inline-flex gap-1 relative touch-none">
                    {sortedTabs.map((tab, index) => (
                        <SortableTab
                            key={tab.id}
                            id={tab.id}
                            color={tab.color}
                            label={`${tab.label} channel`}
                            align={
                                index === 0
                                    ? "start"
                                    : index === sortedTabs.length - 1
                                      ? "end"
                                      : "center"
                            }
                        />
                    ))}
                </div>
            </SortableContext>
            <DragOverlay dropAnimation={null} zIndex={9999}>
                {activeId ? (
                    <div
                        className="w-9 h-5 rounded-md shadow-lg flex items-center justify-start pl-1.5 cursor-grabbing relative"
                        style={{
                            backgroundColor:
                                sortedTabs.find((tab) => tab.id === activeId)
                                    ?.color || "transparent",
                        }}
                    >
                        <GripVertical size={10} className="text-white/80" />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
