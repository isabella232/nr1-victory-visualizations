import React from 'react';
import PropTypes from 'prop-types';
import { VictoryPie, VictoryAnimation, VictoryLabel } from 'victory';
import {
  Card,
  CardBody,
  HeadingText,
  NrqlQuery,
  Spinner,
  AutoSizer,
  PlatformStateContext,
} from 'nr1';
import NrqlQueryError from '../../src/nrql-query-error';
import NoDataState from '../../src/no-data-state';
import { baseLabelStyles } from '../../src/theme';
import { getUniqueAggregatesAndFacets } from '../../src/utils/nrql-validation-helper';
import Colors from '../../src/colors';

const BOUNDS = {
  X: 400,
  Y: 400,
};

const LABEL_SIZE = 24;
const LABEL_PADDING = 10;
const CHART_WIDTH = BOUNDS.X;
const CHART_HEIGHT = BOUNDS.Y - LABEL_SIZE - LABEL_PADDING;

export default class CircularProgressBar extends React.Component {
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
     * Configuration that determines what values to display as critical or
     * successful.
     */
    thresholds: PropTypes.shape({
      criticalThreshold: PropTypes.number,
      highValuesAreSuccess: PropTypes.bool,
    }),
  };

  /**
   * Restructure the data for a aggregate NRQL query with no TIMESERIES and no
   * FACET into a for our visualization works well with.
   */
  transformData = (data) => {
    const {
      data: [series],
      metadata: { color: colorFromData, name: label },
    } = data[0];

    const percent = series.y * 100;
    const color = this.getColor(percent, colorFromData);

    return {
      percent,
      label,
      series: [
        { x: 'progress', y: percent, color },
        { x: 'remainder', y: 100 - percent, color: 'transparent' },
      ],
    };
  };

  nrqlInputIsValid = (data) => {
    const { data: seriesEntries } = data[0];
    const { uniqueAggregates, uniqueFacets } =
      getUniqueAggregatesAndFacets(data);
    const isNonTimeseries = seriesEntries.length === 1;

    return (
      uniqueAggregates.size === 1 && uniqueFacets.size === 0 && isNonTimeseries
    );
  };

  getColor = (value, colorFromData) => {
    const { red6: red, green6: green } = Colors.base;
    const {
      thresholds: { criticalThreshold, highValuesAreSuccess },
    } = this.props;

    const threshold = parseFloat(criticalThreshold);

    if (isNaN(threshold)) {
      return colorFromData;
    }

    if (highValuesAreSuccess) {
      return value > threshold ? green : red;
    }

    return value < threshold ? green : red;
  };

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
          <PlatformStateContext.Consumer>
            {({ timeRange }) => (
              <NrqlQuery
                query={nrqlQueries[0].query}
                accountIds={[parseInt(nrqlQueries[0].accountId)]}
                pollInterval={NrqlQuery.AUTO_POLL_INTERVAL}
                timeRange={timeRange}
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
                        description="The provided NRQL query is not supported by this visualization. Please make sure to have exactly 1 aggregate function in the SELECT clause and no FACET or TIMESERIES clauses."
                      />
                    );
                  }

                  const { percent, label, series } = this.transformData(data);

                  return (
                    <svg
                      viewBox={`0 0 ${BOUNDS.X} ${BOUNDS.Y}`}
                      width={width}
                      height={height}
                      className="CircularProgressBar"
                    >
                      <VictoryPie
                        standalone={false}
                        animate={{ duration: 1000 }}
                        data={series}
                        width={CHART_WIDTH}
                        height={CHART_HEIGHT}
                        padding={10}
                        innerRadius={135}
                        cornerRadius={25}
                        labels={() => null}
                        style={{ data: { fill: ({ datum }) => datum.color } }}
                      />
                      <VictoryAnimation duration={1000} data={percent}>
                        {(percent) => (
                          <VictoryLabel
                            textAnchor="middle"
                            verticalAnchor="middle"
                            x={CHART_WIDTH / 2}
                            y={CHART_HEIGHT / 2}
                            text={`${Math.round(percent)}%`}
                            style={{ ...baseLabelStyles, fontSize: 45 }}
                          />
                        )}
                      </VictoryAnimation>
                      <VictoryLabel
                        text={label}
                        lineHeight={1}
                        x={CHART_WIDTH / 2}
                        y={BOUNDS.Y - LABEL_SIZE}
                        textAnchor="middle"
                        style={{ ...baseLabelStyles, fontSize: LABEL_SIZE }}
                      />
                    </svg>
                  );
                }}
              </NrqlQuery>
            )}
          </PlatformStateContext.Consumer>
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
        Please provide a NRQL query & account ID pair
      </HeadingText>
      <HeadingText
        spacingType={[HeadingText.SPACING_TYPE.MEDIUM]}
        type={HeadingText.TYPE.HEADING_4}
      >
        This Visualization supports NRQL queries with a single SELECT clause
        returning a percentage value (0 to 100 rather than 0 to 1). For example:
      </HeadingText>
      <code>
        {'FROM Transaction SELECT percentage(count(*), WHERE duration < 0.1)'}
      </code>
    </CardBody>
  </Card>
);
