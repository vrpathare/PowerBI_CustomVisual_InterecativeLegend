
"use strict";

import "core-js/stable";
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import IDataViewObject = powerbi.DataViewObject;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import DataView = powerbi.DataView;
import IViewport = powerbi.IViewport;
import VisualObjectInstanceEnumeration = powerbi.VisualObjectInstanceEnumeration;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import { legend, legendInterfaces, legendBehavior, legendPosition, legendData, OpacityLegendBehavior } from "powerbi-visuals-utils-chartutils"
import LegendModule = legend;
import ILegend = legendInterfaces.ILegend;
import LegendData = legendInterfaces.LegendData;
import LegendDataPoint = legendInterfaces.LegendDataPoint;
import LegendDataModule = legendData;
import legendProps = legendInterfaces.legendProps;
import createLegend = legend.createLegend;
import LegendPosition = legendInterfaces.LegendPosition;
import { dataViewObjects } from "powerbi-visuals-utils-dataviewutils"
import DataViewObjects = dataViewObjects;
import { ColorHelper } from "powerbi-visuals-utils-colorutils"
import { interactivityUtils, interactivityBaseService } from "powerbi-visuals-utils-interactivityutils"
import IInteractivityService = interactivityBaseService.IInteractivityService;
import { select, scaleBand, scaleLinear, max, min, axisBottom, axisLeft } from "d3";

interface DataPoint {
    category: string;
    value: number;
    color: string;
    identity: powerbi.visuals.ISelectionId;
    highlighted: boolean
};

interface LegDataPoint {
    category: string;
    color: string;
};

interface LegViewModel {
    dataPoints: DataPoint[];
}

interface ViewModel {
    dataPoints: DataPoint[];
    maxValue: number;
    highlights: boolean;
}

export interface LegChartData {
    legendData: LegendData;
}



export class Visual implements IVisual {

    private host: IVisualHost;
    private svg: d3.Selection<SVGElement, any, any, any>;
    private barContainer: d3.Selection<SVGElement, any, any, any>;
    private selectionManager: ISelectionManager;
    private xAxisGroup: d3.Selection<SVGElement, any, any, any>;
    private yAxisGroup: d3.Selection<SVGElement, any, any, any>;
    private legend: ILegend;
    private legendObjectProperties: IDataViewObject;
    private legChartData: LegChartData;
    private viewport: IViewport;



    private settings = {
        axis: {
            x: {
                padding: {
                    default: 50,
                    value: 50
                },
            },
            y: {
                padding: {
                    default: 50,
                    value: 50
                },
            }

        },
        border: {
            top: 10
        }
    }

    constructor(options: VisualConstructorOptions) {

        const element: HTMLElement = options.element;
        this.host = options.host;
        this.svg = select(options.element)
            .append('svg')
            .classed('jorgeBarChart', true);

        this.barContainer = this.svg.append('g')
            .classed('bar-group', true);

        this.xAxisGroup = this.svg.append('g')
            .classed('x-axis', true);

        this.yAxisGroup = this.svg.append('g')
            .classed('y-axis', true);

        this.legend = createLegend(
            element,
            false,
            null,
            true,
            LegendPosition.Top);



        this.selectionManager = this.host.createSelectionManager();
    }

    public update(options: VisualUpdateOptions) {


        let viewModel = this.getViewModel(options);
        let width = options.viewport.width;
        let height = options.viewport.height;

        //this.parseLegendProperties(dataView);
        this.renderLegend();

        this.svg.attr('width', width).attr('height', height);

        let yScale = scaleLinear()
            .domain([0, viewModel.maxValue])
            .range([height - this.settings.axis.x.padding.value, 0 + this.settings.border.top]);

        let yAxis = axisLeft(yScale).tickSize(1)

        this.yAxisGroup.attr('transform', 'translate(' + this.settings.axis.y.padding.value + ',0)').call(yAxis)

        let xScale = scaleBand()
            .domain(viewModel.dataPoints.map(d => d.category))
            .rangeRound([this.settings.axis.y.padding.value, width])
            .padding(0.1);

        let xAxis = axisBottom(xScale).tickSize(1);

        this.xAxisGroup.attr('transform', 'translate(0, ' + (height - this.settings.axis.x.padding.value) + ')').call(xAxis);

        let bars = this.barContainer
            .selectAll('.bar')
            .data(viewModel.dataPoints);

        bars.enter()
            .append('rect')
            .classed('bar', true)
            .attr('width', xScale.bandwidth())
            .attr('height', d => height - yScale(d.value) - this.settings.axis.x.padding.value)
            .attr('y', d => yScale(d.value))
            .attr('x', d => xScale(d.category))
            .attr('fill', d => d.color)
            .style('fill-opacity', d => viewModel.highlights ? d.highlighted ? 1.0 : 0.5 : 1.0)
            .on('click', (d) => {
                this.selectionManager.select(d.identity, true)
                    .then(ids => {
                        bars.style(
                            'fill-opacity', ids.length > 0 ? 0.5 : 1.0
                        );
                    });
            });

        bars.exit().remove();

        //this.legend.reset();
        //this.legend.drawLegend({ dataPoints: [] }, (this.viewport));

    }

    public converter(dataView: DataView, options: VisualUpdateOptions): LegChartData {

        let legendData: LegendData = {
            dataPoints: []
        }

        let dv = options.dataViews;

        let view = dv[0].categorical;
        let categories = view.categories[0];
        let values = view.values[0];
        let highlights = values.highlights;

        for (let i = 0, len = Math.max(categories.values.length, values.values.length); i < len; i++) {
            legendData.dataPoints.push(<LegendDataPoint>{
                label: <string>categories.values[i],
                color: this.host.colorPalette.getColor(<string>categories.values[i]).value
            });
        }





        return {
            legendData: legendData
        }
    }

    private getViewModel(options: VisualUpdateOptions): ViewModel {

        let dv = options.dataViews;

        let viewModel: ViewModel = {
            dataPoints: [],
            maxValue: 0,
            highlights: false
        };

        if (!dv
            || !dv[0]
            || !dv[0].categorical
            || !dv[0].categorical.categories
            || !dv[0].categorical.categories[0].source
            || !dv[0].categorical.values)
            return viewModel;

        let view = dv[0].categorical;
        let categories = view.categories[0];
        let values = view.values[0];
        let highlights = values.highlights;

        for (let i = 0, len = Math.max(categories.values.length, values.values.length); i < len; i++) {
            viewModel.dataPoints.push({
                category: <string>categories.values[i],
                value: <number>values.values[i],
                color: this.host.colorPalette.getColor(<string>categories.values[i]).value,
                identity: this.host.createSelectionIdBuilder()
                    .withCategory(categories, i)
                    .createSelectionId(),
                highlighted: highlights ? highlights[i] ? true : false : false
            });
        }

        viewModel.maxValue = max(viewModel.dataPoints, d => d.value);
        viewModel.highlights = viewModel.dataPoints.filter(d => d.highlighted).length > 0;

        return viewModel;
    }

    private renderLegend(): void {
        let legChartData: LegChartData = this.legChartData;

        if (!legChartData.legendData) {
            return;
        }



        const { height, width } = this.viewport,
            legendData: LegendData = legChartData.legendData;

        if (this.legendObjectProperties) {
            LegendDataModule.update(legendData, this.legendObjectProperties);

            let position: string = this.legendObjectProperties[legendProps.position] as string;

            if (position) {
                this.legend.changeOrientation(LegendPosition[position]);
            }
            this.legend.drawLegend(legendData, (this.viewport))
        } else {
            this.legend.changeOrientation(LegendPosition.Top);
            this.legend.drawLegend({ dataPoints: [] }, (this.viewport))
        }

        
        //LegendModule.positionChartArea(this.svg, this.legend);
    }







}