import React from 'react';
import PropTypes from 'prop-types';
import {
  Card,
  CardBody,
  HeadingText,
  NrqlQuery,
  Spinner,
  AutoSizer,
} from 'nr1';
import {
  VictoryChart,
  VictoryScatter,
  VictoryContainer,
  VictoryAxis,
  VictoryLabel,
  VictoryTooltip,
} from 'victory';
import Legend from '../../src/legend';
import NrqlQueryError from '../../src/nrql-query-error/nrql-query-error';
import theme from '../../src/theme';
import {
  getUniqueAggregatesAndFacets,
  getUniqueNonAggregates,
} from '../../src/utils/nrql-validation-helper';
import NoDataState from '../../src/no-data-state';
import { getFacetLabel } from '../../src/utils/facets';
import { formatNumberTicks, typeToUnit } from '../../src/utils/units';

const tooltipTextStyles = {
  fontFamily: 'var(--nr1--typography--body--1--font-family)',
  fontWeight: 'var(--nr1--typography--body--1--font-weight)',
  fontSize: 10,
};

export default class ScatterPlotChartVisualization extends React.Component {
  // Custom props you wish to be configurable in the UI must also be defined in
  // the nr1.json file for the visualization. See docs for more details.
  static propTypes = {
    /**
     * An array of objects consisting of a nrql `query` and `accountId`.
     * This should be a standard prop for any NRQL based visualizations.
     */
    nrqlQueries: PropTypes.arrayOf(
      PropTypes.shape({
        accountId: PropTypes.number,
        query: PropTypes.string,
      })
    ),

    /**
     * Object with a singular boolean value.
     * Determines if "other" attributes are included in visualization.
     */
    other: PropTypes.shape({
      visible: PropTypes.bool,
    }),
  };

  getAggregatesData = (rawData, functionDisplayNames) => {
    const {
      other: { visible: showOther },
    } = this.props;
    const queryHasZField = functionDisplayNames.length > 2;

    // `rawData` contains an entry per combo of aggregate function and facet. Here
    // we reduce that structure to an entry per facet each of which contains
    // all of the facet's aggregate function values.
    const facetGroupData = rawData.reduce((acc, { data, metadata }) => {
      const facetGroupName = getFacetLabel(metadata?.groups);
      if (!showOther && facetGroupName === 'Other') {
        return acc;
      }

      const dataValue = data?.[0]?.y;
      const unitType = metadata?.units_data?.y;
      const aggregateFunction = metadata?.groups.filter(
        (group) => group.type === 'function'
      )[0];
      const functionDisplayName = aggregateFunction?.displayName;
      const functionPosition =
        functionDisplayNames.indexOf(functionDisplayName);

      if (!(facetGroupName in acc)) {
        acc[facetGroupName] = {};
      }

      switch (functionPosition) {
        case 0:
          // The first aggregate function determines the x-axis value
          acc[facetGroupName].color = metadata.color;
          acc[facetGroupName].x = dataValue;
          acc[facetGroupName].xUnitType = unitType;
          acc[facetGroupName].xDisplayName = functionDisplayName;
          break;
        case 1:
          // The second aggregate function determines the y-axis value
          acc[facetGroupName].y = dataValue;
          acc[facetGroupName].yUnitType = unitType;
          acc[facetGroupName].yDisplayName = functionDisplayName;
          break;
        case 2:
          // If present, the third aggregate function determines the size
          acc[facetGroupName].z = dataValue;
          acc[facetGroupName].zUnitType = unitType;
          acc[facetGroupName].zDisplayName = functionDisplayName;
          break;
      }

      return acc;
    }, {});

    const series = Object.entries(facetGroupData).map(
      ([facetGroupName, facetGroupData]) => ({
        facetGroupName,
        ...facetGroupData,
      })
    );

    const seriesWithoutNulls = series.filter(
      (entry) => !this.entryHasNulls(entry, queryHasZField)
    );

    const xValues = seriesWithoutNulls.map(({ x }) => x);
    const yValues = seriesWithoutNulls.map(({ y }) => y);

    return {
      series: seriesWithoutNulls,
      range: {
        xMin: Math.min(...xValues),
        xMax: Math.max(...xValues),
        yMin: Math.min(...yValues),
        yMax: Math.max(...yValues),
      },
    };
  };

  getNonAggregatesData = (rawData) => {
    const { uniqueNonAggregates } = getUniqueNonAggregates(rawData);
    const queryHasZField = uniqueNonAggregates.size > 2;
    const attributeNames = Array.from(uniqueNonAggregates);
    const xAttributeName = attributeNames[0];
    const yAttributeName = attributeNames[1];
    const zAttributeName = attributeNames[2];
    const { data, metadata } = rawData[0];
    const xUnitType = metadata.units_data[xAttributeName];
    const yUnitType = metadata.units_data[yAttributeName];
    const zUnitType = metadata.units_data[zAttributeName];
    const color = metadata.color;
    let xMin;
    let xMax;
    let yMin;
    let yMax;

    const series = data.map((point) => {
      const x = point[xAttributeName];
      const y = point[yAttributeName];
      const datapoint = {
        x,
        y,
        xDisplayName: xAttributeName,
        yDisplayName: yAttributeName,
        xUnitType,
        yUnitType,
        color,
      };
      xMin = Math.min(xMin || x, x);
      xMax = Math.max(xMax || x, x);
      yMin = Math.min(yMin || y, y);
      yMax = Math.max(yMax || y, y);

      // If present, the third attribute queried determines the size
      if (point[zAttributeName]) {
        datapoint.z = point[zAttributeName];
        datapoint.zDisplayName = zAttributeName;
        datapoint.zUnitType = zUnitType;
      }

      return datapoint;
    });

    const seriesWithoutNulls = series.filter(
      (entry) => !this.entryHasNulls(entry, queryHasZField)
    );

    return {
      series: seriesWithoutNulls,
      range: { xMin, xMax, yMin, yMax },
    };
  };

  entryHasNulls = (entry, queryHasZField) => {
    const axisValues = [entry.x, entry.y];

    if (queryHasZField) {
      axisValues.push(entry.z);
    }

    return axisValues.some((v) => v === null || v === undefined);
  };

  transformData = (data) => {
    const { uniqueNonAggregates } = getUniqueNonAggregates(data);
    if (uniqueNonAggregates.size > 1) {
      return this.getNonAggregatesData(data);
    }

    const { uniqueAggregates } = getUniqueAggregatesAndFacets(data);
    if (uniqueAggregates.size > 1) {
      return this.getAggregatesData(data, Array.from(uniqueAggregates));
    }

    return null;
  };

  nrqlInputIsValid = (data) => {
    const { uniqueAggregates } = getUniqueAggregatesAndFacets(data);
    const { uniqueNonAggregates } = getUniqueNonAggregates(data);

    return uniqueAggregates.size >= 2 || uniqueNonAggregates.size >= 2;
  };

  getAxisLabelProps = ({ displayName, unitType, min, max, tickCount }) => {
    return {
      label: `${displayName}${typeToUnit(unitType || 'UNKNOWN')}`,
      tickCount,
      tickFormat: (tick) =>
        formatNumberTicks({
          unitType,
          tick,
          tickIncrement: (max - min) / tickCount,
        }),
    };
  };

  tooltipLabel = ({ datum }) => {
    const lines = [];

    if ('facetGroupName' in datum) {
      lines.push(datum.facetGroupName);
    }

    lines.push(this.valueLabel(datum.xDisplayName, datum.x, datum.xUnitType));
    lines.push(this.valueLabel(datum.yDisplayName, datum.y, datum.yUnitType));

    if ('z' in datum) {
      lines.push(this.valueLabel(datum.zDisplayName, datum.z, datum.zUnitType));
    }

    return lines;
  };

  valueLabel = (displayName, value, unitType) =>
    `${displayName}: ${value?.toLocaleString() ?? ''}${
      typeToUnit(unitType) ?? ''
    }`;

  render() {
    const { nrqlQueries } = this.props;
    const nrqlQueryPropsAvailable =
      nrqlQueries &&
      nrqlQueries[0] &&
      nrqlQueries[0].accountId &&
      nrqlQueries[0].query;

    if (!nrqlQueryPropsAvailable) {
      return <EmptyState />;
    }

    return (
      <AutoSizer>
        {({ width, height }) => (
          <NrqlQuery
            query={nrqlQueries[0].query}
            accountIds={[parseInt(nrqlQueries[0].accountId)]}
            pollInterval={NrqlQuery.AUTO_POLL_INTERVAL}
          >
            {({ data, loading, error }) => {
              if (loading) {
                return <Spinner />;
              }

              if (error && data === null) {
                return (
                  <NrqlQueryError
                    title="NRQL Syntax Error"
                    description={error.message}
                  />
                );
              }

              if (!data.length) {
                return <NoDataState />;
              }

              if (!this.nrqlInputIsValid(data)) {
                return (
                  <NrqlQueryError
                    title="Unsupported NRQL query"
                    description="The provided NRQL query is not supported by this visualization. This chart supports non-aggregate and aggregate queries with an optional FACET clause. Please make sure to have 2-3 aggregate functions or 2-3 attributes in the SELECT clause."
                  />
                );
              }
              const { uniqueAggregates } = getUniqueAggregatesAndFacets(data);
              const { series, range } = this.transformData(data);

              if (!series.length) {
                return <NoDataState />;
              }

              const legendItems = series.reduce((acc, curr) => {
                if (!acc.some(({ label }) => label === curr.facetGroupName)) {
                  acc.push({ label: curr.facetGroupName, color: curr.color });
                }
                return acc;
              }, []);

              const yTickLabelWidth = 45;
              const yAxisPadding = 16;
              const chartLeftPadding = yTickLabelWidth + yAxisPadding + 25;
              const chartRightPadding = 25;
              const legendHeight = 50;
              const spaceBelowLegend = 16;

              const xAxisLabelProps = this.getAxisLabelProps({
                displayName: series[0]?.xDisplayName,
                unitType: series[0]?.xUnitType,
                min: range.xMin,
                max: range.xMax,
                tickCount: Math.round(
                  (width - chartLeftPadding - chartRightPadding) / 100
                ),
              });

              const yAxisLabelProps = this.getAxisLabelProps({
                displayName: series[0]?.yDisplayName,
                unitType: series[0]?.yUnitType,
                min: range.yMin,
                max: range.yMax,
                tickCount: Math.round((height - legendHeight) / 70),
              });

              return (
                <>
                  <VictoryChart
                    containerComponent={<VictoryContainer responsive={false} />}
                    width={width}
                    height={height - legendHeight - spaceBelowLegend}
                    padding={{
                      top: 16,
                      bottom: 60,
                      left: chartLeftPadding,
                      right: chartRightPadding,
                    }}
                    theme={theme}
                  >
                    <VictoryAxis
                      {...xAxisLabelProps}
                      style={{
                        axisLabel: { padding: 35 },
                      }}
                    />
                    <VictoryAxis
                      {...yAxisLabelProps}
                      dependentAxis
                      style={{
                        axisLabel: { padding: yTickLabelWidth + yAxisPadding },
                      }}
                    />
                    <VictoryScatter
                      data={series}
                      minBubbleSize={2.5} // only applied when z values are present
                      style={{
                        data: {
                          fill: ({ datum }) => datum.color,
                          fillOpacity: 0.7,
                        },
                      }}
                      labels={this.tooltipLabel}
                      labelComponent={
                        <VictoryTooltip
                          labelComponent={
                            <VictoryLabel
                              lineHeight={1.4}
                              style={[
                                {
                                  ...tooltipTextStyles,
                                  fontWeight:
                                    uniqueAggregates.size > 1
                                      ? 'var(--nr1--typography--heading--6--font-weight)'
                                      : tooltipTextStyles.fontWeight,
                                },
                                tooltipTextStyles,
                                tooltipTextStyles,
                                tooltipTextStyles,
                              ]}
                            />
                          }
                          horizontal
                          constrainToVisibleArea
                          pointerLength={8}
                          dx={5}
                          flyoutStyle={{
                            stroke: ({ datum }) => datum.color,
                            strokeWidth: 2,
                            filter: 'none',
                          }}
                        />
                      }
                    />
                  </VictoryChart>
                  {uniqueAggregates.size > 1 && (
                    <Legend
                      style={{
                        height: legendHeight,
                        marginLeft: chartLeftPadding,
                        marginRight: chartRightPadding,
                      }}
                      items={legendItems}
                    />
                  )}
                </>
              );
            }}
          </NrqlQuery>
        )}
      </AutoSizer>
    );
  }
}

const EmptyState = () => (
  <Card className="EmptyState">
    <CardBody className="EmptyState-cardBody">
      <HeadingText
        spacingType={[HeadingText.SPACING_TYPE.LARGE]}
        type={HeadingText.TYPE.HEADING_3}
      >
        Please provide one NRQL query & account ID pair with two or three
        entries in the SELECT clause
      </HeadingText>
      <HeadingText
        spacingType={[HeadingText.SPACING_TYPE.MEDIUM]}
        type={HeadingText.TYPE.HEADING_4}
      >
        An example non-aggregate NRQL query you can try is:
      </HeadingText>
      <code>FROM Transaction SELECT duration, externalDuration LIMIT 500</code>
      <HeadingText
        spacingType={[
          HeadingText.SPACING_TYPE.LARGE,
          HeadingText.SPACING_TYPE.MEDIUM,
          HeadingText.SPACING_TYPE.MEDIUM,
          HeadingText.SPACING_TYPE.MEDIUM,
        ]}
        type={HeadingText.TYPE.HEADING_4}
      >
        An example aggregate NRQL query you can try is:
      </HeadingText>
      <code>
        FROM Transaction SELECT percentage(count(*), WHERE duration &gt; 1) as
        'Slow transactions', percentage(count(*), WHERE externalDuration &gt;
        0.5) as 'Slow external calls', count(*) FACET appName
      </code>
    </CardBody>
  </Card>
);
