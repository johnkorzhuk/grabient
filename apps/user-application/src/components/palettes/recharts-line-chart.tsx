import { Line, LineChart, XAxis, YAxis, Tooltip } from "recharts";
import { rgbChannelConfig } from "@/constants/colors";

interface CustomTooltipProps {
    active?: boolean;
    payload?: Array<{
        payload: {
            t: number;
            red: number;
            green: number;
            blue: number;
            rgb: string;
            hex: string;
        };
    }>;
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0]?.payload;
    if (!data) return null;
    const r = Math.round(data.red * 255);
    const g = Math.round(data.green * 255);
    const b = Math.round(data.blue * 255);
    const rgbColor = `rgb(${r}, ${g}, ${b})`;
    const hexColor = data.hex;

    return (
        <div className="rounded-lg border border-border/50 bg-background/20 backdrop-blur-sm shadow-xl p-2 z-20">
            <div className="flex flex-col gap-2.5 font-poppins">
                <div className="flex items-center gap-3">
                    <div
                        className="h-5 w-5 rounded-sm"
                        style={{ backgroundColor: rgbColor }}
                    />
                    <span className="font-mono text-xs">{hexColor}</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="font-mono text-xs flex items-center">
                        rgb(
                        <span className="inline-flex items-center">
                            <span
                                className="h-2 w-2 mx-1 rounded-sm"
                                style={{
                                    backgroundColor: rgbChannelConfig.red.color,
                                }}
                            />
                            {r}
                        </span>
                        ,
                        <span className="inline-flex items-center">
                            <span
                                className="h-2 w-2 mx-1 rounded-sm"
                                style={{
                                    backgroundColor:
                                        rgbChannelConfig.green.color,
                                }}
                            />
                            {g}
                        </span>
                        ,
                        <span className="inline-flex items-center">
                            <span
                                className="h-2 w-2 mx-1 rounded-sm"
                                style={{
                                    backgroundColor:
                                        rgbChannelConfig.blue.color,
                                }}
                            />
                            {b}
                        </span>
                        )
                    </span>
                </div>
            </div>
        </div>
    );
};

export interface RechartsLineChartProps {
    data: Array<{
        t: number;
        red: number;
        green: number;
        blue: number;
        rgb: string;
        hex: string;
    }>;
    width?: number;
    height?: number;
}

export function RechartsLineChart({ data, width, height }: RechartsLineChartProps) {
    if (width && height && width > 0 && height > 0) {
        return (
            <div className="h-full w-full overflow-visible">
                <LineChart
                    accessibilityLayer
                    data={data}
                    width={width}
                    height={height}
                    margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                >
                    <XAxis
                        dataKey="t"
                        hide={true}
                        domain={[0, 1]}
                        type="number"
                        scale="linear"
                    />

                    <YAxis
                        hide={true}
                        domain={[0, 1]}
                        type="number"
                        scale="linear"
                        allowDataOverflow={true}
                    />

                    <Tooltip
                        content={<CustomTooltip />}
                        isAnimationActive={false}
                    />

                    <Line
                        dataKey="red"
                        type="linear"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{
                            r: 4,
                            strokeWidth: 1,
                            stroke: rgbChannelConfig.red.color,
                            clipDot: false,
                        }}
                        isAnimationActive={false}
                        stroke={rgbChannelConfig.red.color}
                        strokeOpacity={1}
                    />
                    <Line
                        dataKey="green"
                        type="linear"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{
                            r: 4,
                            strokeWidth: 1,
                            stroke: rgbChannelConfig.green.color,
                            clipDot: false,
                        }}
                        isAnimationActive={false}
                        stroke={rgbChannelConfig.green.color}
                        strokeOpacity={1}
                    />
                    <Line
                        dataKey="blue"
                        type="linear"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{
                            r: 4,
                            strokeWidth: 1,
                            stroke: rgbChannelConfig.blue.color,
                            clipDot: false,
                        }}
                        isAnimationActive={false}
                        stroke={rgbChannelConfig.blue.color}
                        strokeOpacity={1}
                    />
                </LineChart>
            </div>
        );
    }

    return (
        <div className="h-full w-full flex items-center justify-center" />
    );
}
