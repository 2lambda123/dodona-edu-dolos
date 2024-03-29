<!-- eslint-disable -->
<template>
  <v-container fluid fill-height>
    <v-row style="height: 100%">
      <v-col cols="12" class="no-y-padding">
        <div ref="container" class="graph-container">
          <form class="settings">
            <p>
              <label>
                Similarity ≥ {{ cutoff }}<br />
                <input
                  type="range"
                  min="0.25"
                  max="1"
                  step="0.01"
                  v-model="cutoff"
                />
              </label>
            </p>
            <p>
              <label
                ><input type="checkbox" v-model="showSingletons" /> Display
                singletons</label
              >
            </p>
          </form>
          <div class="node-selected">
            <ul v-if="Object.values(legend).length > 1" class="legend">
              <li
                v-for="legendDatum of Object.values(legend).sort()"
                :key="legendDatum.label"
              >
                <label
                  ><input
                    type="checkbox"
                    v-model="legendDatum.selected"
                    class="legend-checkbox"
                    @change="updateGraph"
                  />
                  <span class="legend-label"
                    ><span
                      class="legend-color"
                      :style="{
                        'background-color': legendDatum.color,
                      }"
                    ></span>
                    {{ legendDatum.label }}
                  </span></label
                >
              </li>
            </ul>

            <!-- <span class="path">{{ selectedInfo.path }}</span> -->
            <ul v-if="selectedInfo.info !== undefined">
              <li v-if="selectedInfo.info.name !== undefined">Name: {{ selectedInfo.info.name }}</li>
              <li>Timestamp: {{ selectedInfo.info.timestamp }}</li>
              <li>Label: {{ selectedInfo.info.label }}</li>
            </ul>
          </div>
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
/* eslint-disable */

import { Component, Watch } from "vue-property-decorator";
import DataView from "@/views/DataView";
import * as d3 from "d3";

@Component()
export default class PlagarismGraph extends DataView {
  created() {
    const svg = d3.create("svg").attr("viewBox", [0, 0, 500, 500]);
    const container = svg.append("g");
    d3.zoom().on("zoom", event => {
      container.attr("transform", event.transform);
    })(svg);
    const defs = svg.append("svg:defs");
    defs
      .append("svg:marker")
      .attr("id", "arrow-marker")
      .attr("viewBox", "0 -6 10 12")
      .attr("refX", "5")
      .attr("markerWidth", 2)
      .attr("markerHeight", 2)
      .attr("orient", "auto")
      .append("svg:path")
      .attr("d", "M5,-5L10,0L5,5M10,0L0,0");

    this.svg = svg;
    this.svgLinks = container.append("g");
    this.svgNodes = container.append("g");

    this.simulation = d3
      .forceSimulation()
      .alphaDecay(0.01)
      .force(
        "link",
        d3
          .forceLink()
          .id((d) => d.id)
          .strength(
            (link) =>
              Math.pow(Math.max(0.4, (link.similarity - 0.8) / 0.2), 3) /
              Math.min(
                link.source.neighbors.length,
                link.target.neighbors.length
              )
          )
      )
      .force("charge", d3.forceManyBody().distanceMax(200).strength(-10))
      .force("center", d3.forceCenter(this.width / 2, this.height / 2))
      .force("compact_x", d3.forceX(this.width / 2).strength(0.01))
      .force("compact_y", d3.forceY(this.height / 2).strength(0.01));

    this.simulation.on("tick", () => {
      if (this.svgLink)
        this.svgLink.attr("d", (d) => {
          const { x: x0, y: y0 } = d.source;
          const { x: x1, y: y1 } = d.target;
          return `M${x0},${y0}L${0.5 * (x0 + x1)},${
            0.5 * (y0 + y1)
          }L${x1},${y1}`;
        });

      if (this.svgNode)
        this.svgNode.attr("cx", (d) => d.x || 0).attr("cy", (d) => d.y || 0);
    });

    this.resizeHandler = () => {
      this.width = this.$refs.container.clientWidth;
      this.height = this.$refs.container.clientHeight;
    };
    window.addEventListener("resize", this.resizeHandler);
    this.updateGraph();
  }
  data() {
    return {
      cutoff: 0.75,
      nodes: [],
      selectedNode: -1,
      links: [],
      width: 100,
      height: 100,
      legend: [],
      showSingletons: false,
    };
  }
  get selectedInfo() {
    if (this.selectedNode >= 0) {
      const node = this.nodes[this.selectedNode];
      const file = node.file;
      return {
        path: file.path,
        info: {
          file: file.path,
          name: file.extra.full_name || "Unavailable",
          timestamp: file.extra.timestamp.toLocaleString() || "Unavailable",
          label: file.extra.labels || "Unavailable",
        },
      };
    } else {
      return {
        path: "Nothing selected",
        info: undefined,
      };
    }
  }

  @Watch("width")
  @Watch("height")
  updateSize() {
    window.simulation = this.simulation;
    this.svg.attr("viewBox", [0, 0, this.width, this.height]);
    this.simulation.force("compact_x").x(this.width / 2);
    this.simulation.force("compact_y").y(this.height / 2);
    this.simulation
      .force("center")
      .x(this.width / 2)
      .y(this.height / 2);
  }

  @Watch("cutoff")
  @Watch("files")
  @Watch("showSingletons")
  updateGraph() {
    if (this.delayUpdateGraph >= 0) clearTimeout(this.delayUpdateGraph);
    this.delayUpdateGraph = setTimeout(() => {
      this.delayUpdateGraph = -1;
      const nodeMap = this.getRawNodeMap();
      const labels = this.legend;
      Object.values(nodeMap).forEach((node) => {
        node.component = -1;
        node.neighbors = [];
        node.links = [];
        node.visible = labels[node.label].selected;
      });
      this.links = Object.entries(this.pairs)
        .filter(([key, value]) => value.similarity >= this.cutoff)
        .filter(
          ([_, { leftFile, rightFile }]) =>
            nodeMap[leftFile.id].visible && nodeMap[rightFile.id].visible
        )
        .map(([key, value]) => {
          let left = nodeMap[value.leftFile.id];
          let right = nodeMap[value.rightFile.id];
          const leftInfo = left.file.extra;
          const rightInfo = right.file.extra;
          const directed = leftInfo.createdAt && rightInfo.createdAt;
          if (directed && rightInfo.createdAt < leftInfo.createdAt)
            [left, right] = [right, left];
          left.neighbors.push(right);
          right.neighbors.push(left);
          const similarity = value.similarity;
          const link = {
            id: key,
            directed: directed,
            source: left,
            target: right,
            similarity,
            linkWidth:
              4 * Math.pow(Math.max(0.4, (similarity - 0.75) / 0.2), 2),
          };
          left.links.push(link);
          right.links.push(link);
          return link;
        });
      let component = 0;
      Object.values(nodeMap).forEach((node) => {
        if (node.component < 0) {
          node.component = ++component;
          const checkNode = [node];
          while (checkNode.length) {
            checkNode.pop().neighbors.forEach((n) => {
              if (n.component < 0) {
                n.component = component;
                checkNode.push(n);
              }
            });
          }
        }
      });
      this.removeSelectedNode();
      this.nodes = Object.values(nodeMap).filter(n => n.visible);
      if (!this.showSingletons) {
        this.nodes = this.nodes.filter((n) => n.neighbors.length);
      }
      this.nodes.forEach((node, index) => {
        node.index = index;
        let incoming = 0;
        let outgoing = 0;
        node.links.forEach((l) => {
          if (l.directed) {
            if (l.target === node) ++incoming;
            else ++outgoing;
          }
        });
        node.source = outgoing > 1 && incoming === 0;
        node.fillColor = labels[node.label].color;
      });
    }, 50);
  }
  removeSelectedNode() {
    if (this.selectedNode >= 0) {
      this.svgNodes.select("circle.node.selected").classed("selected", false);
      this.nodes[this.selectedNode].selected = false;
      this.selectedNode = -1;
    }
  }
  getRawNodeMap() {
    if (!this.dataLoaded) return {};
    if (this._nodeMap) return this._nodeMap;
    const nodeMap = {};
    let labels = new Set();
    Object.entries(this.files).forEach(([key, value]) => {
      const label = value.extra.labels || "N/A";
      labels.add(label);
      nodeMap[value.id] = {
        id: key,
        file: value,
        component: -1,
        neighbors: [],
        label: label,
        x: this.width * Math.random(),
        y: this.height * Math.random(),
        vx: 0,
        vy: 0,
      };
    });
    const colorScale = d3
      .scaleOrdinal(d3.schemeCategory10)
      .domain([...labels].reverse());
    labels = [...labels].sort().map((p) => ({
      label: p,
      selected: true,
      color: colorScale(p),
    }));
    this.legend = Object.fromEntries(labels.map((p) => [p.label, p]));
    return (this._nodeMap = nodeMap);
  }
  @Watch("nodes")
  @Watch("links")
  updateSimulation() {
    this.svgLink = this.svgLinks
      .selectAll("path")
      .data(this.links)
      .join("path")
      .classed("link", true)
      .classed("directed", (d) => d.directed)
      .attr("stroke-width", (d) => d.linkWidth)
      .on("click", (event, d) => this.toCompareView(d));

    this.svgNode = this.svgNodes
      .selectAll("circle")
      .data(this.nodes)
      .join("circle")
      .classed("node", true)
      .classed("source", (d) => d.source)
      .attr("r", 5)
      .attr("fill", (d) => d.fillColor)
      .call(this.drag());

    this.simulation.nodes(this.nodes);
    this.simulation.alpha(0.5).alphaTarget(0.3).restart();
    this.simulation.force("link").links(this.links);
  }

  mounted() {
    // @ts-ignore
    (async () => {
      if (!this.dataLoaded) await this.ensureData();
      this.updateSimulation();
    })();

    this.$refs.container.appendChild(this.svg.node());
    this.resizeHandler();
  }

  drag() {
    return d3
      .drag()
      .on("start", event => {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
        event.subject.justDragged = false;
      })
      .on("drag", event => {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
        event.subject.justDragged = true;
      })
      .on("end", event => {
        if (!event.active) this.simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
        if (!event.subject.justDragged) {
          // clicked
          if (event.subject.index === this.selectedNode) {
            this.removeSelectedNode();
          } else {
            this.removeSelectedNode();
            d3.select(event.sourceEvent.target).classed("selected", true);
            event.subject.selected = true;
            this.selectedNode = event.subject.index;
          }
        }
      });
  }

  toCompareView(diff) {
    this.$router.push(`/compare/${diff.id}`)
  }

  destroyed() {
    this.simulation.stop();
    window.removeEventListener("resize", this.resizeHandler);
  }
}
</script>

<style lang="scss">
.graph-container {
  width: 100%;
  height: 100%;
  position: relative;

  .legend {
    position: absolute;
    right: 0;
    top: 0;
    z-index: 4;
    li {
      display: block;

      span.legend-color {
        display: inline-block;
        width: 1em;
        height: 1em;
        border: 2px white solid;
      }

      input.legend-checkbox {
        display: none;

        &:not(:checked) {
          & + .legend-label {
            opacity: 0.3;
          }
        }
      }
    }
  }

  svg {
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    z-index: 1;

    #arrow-marker {
      stroke: #666;
      fill: transparent;
      stroke-linecap: round;
    }

    .node {
      stroke: white;
      stroke-width: 2;
      stroke-linecap: round;

      &.source {
        stroke-width: 0;
      }
      &.selected {
        stroke: red;
        stroke-dasharray: 1.14, 2;
        stroke-width: 1;
      }
      &:hover {
        cursor: grab;
      }
    }

    .link {
      stroke: #999;
      opacity: 0.6;
      &.directed {
        marker-mid: url(#arrow-marker);
      }
      &:hover {
         cursor: pointer;
      }
    }
  }

  .settings {
    position: absolute;
    right: 0;
    bottom: 0;
    z-index: 5;
  }
}
</style>
