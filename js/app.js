// Based on:
// http://bl.ocks.org/rgdonohue/9280446

var width, height, minScale = 1, maxScale = 4, scaleBy = .2, projection, path, graticule, svg, zoom, attributeArray = [], currentAttribute = 0;

/** 
 * Initializes map
 */

function init() {
    setupMap();
    mapInteraction();
}

/** 
 * Creates svg and defines base map info - projection, graticule, etc.
 */

function setupMap() {
  width = document.getElementById('map').offsetWidth, 
  height = width * .65;

  document.getElementById('map').style.height = height + 'px';

  projection = d3.geo.mercator()
    .scale((width + 1) / 2 / Math.PI)
    .translate([width / 2, height / 2])
    .precision(0.1);

  path = d3.geo.path()
      .projection(projection);

  graticule = d3.geo.graticule();

  zoom = d3.behavior.zoom().scaleExtent([minScale, maxScale]).on("zoom", zoomed);

  svg = d3.select("#map").append("svg")
      .attr("width", width)
      .attr("height", height)
      .call(zoom)
      .append("g")
      .classed("viewport", true);

  svg.append("defs").append("path")
      .datum({type: "Sphere"})
      .attr("id", "sphere")
      .attr("d", path);

  svg.append("use")
      .attr("class", "stroke")
      .attr("xlink:href", "#sphere");

  svg.append("path")
      .datum(graticule)
      .attr("class", "graticule")
      .attr("d", path);

  loadData();
}

/** 
 * Main zoom / pan function. See https://github.com/mbostock/d3/wiki/Zoom-Behavior
 */

function zoomed() {
  svg.attr("transform", "translate(" + zoom.translate()[0] + " " + zoom.translate()[1] + ") scale(" + zoom.scale() + ")");
}

/** 
 * Zooms in map programatically, keeping existing center
 */

function zoomInMap() {
  var scale = zoom.scale();
  if(scale <= maxScale - scaleBy){
    zoom.scale(scale + scaleBy);
    zoom.translate([
      zoom.translate()[0] - (width * scaleBy / 2), 
      zoom.translate()[1] - (height * scaleBy / 2)
    ]);
    zoomed();       
  }
}

/** 
 * Zooms out map programatically, keeping existing center
 */

function zoomOutMap() {
  var scale = zoom.scale();
  if(scale >= minScale + scaleBy){
    zoom.scale(scale - scaleBy);
    zoom.translate([
      zoom.translate()[0] + (width * scaleBy / 2), 
      zoom.translate()[1] + (height * scaleBy / 2)
    ]);
    zoomed();       
  }
}

/** 
 * Resets map to original state
 */

function resetMap() {
  zoom.scale(1);
  zoom.translate([0,0]);
  zoomed();
  d3.select("#country-info").style("opacity", "0");
}

/** 
 * Loads data files asynchronously using d3 queue plugin
 */

function loadData() {
  queue()
    .defer(d3.json, "data/world-topo.json") 
    .defer(d3.csv, "data/country-data.csv")
    .await(processData);
}

/** 
 * Processes data loaded by loadData(), and calls draw map function
 * @param {object} error - file loading errors
 * @param {object} world - object imported from json containing country paths
 * @param {object} countryData - object imported from csv contraining contry stats
 */

function processData(error,world,countryData) {
  // function accepts any errors from the queue function as first argument, then
  // each data object in the order of chained defer() methods above

  var countries = world.objects.countries.geometries;
  for (var i in countries) {
    for (var j in countryData) {
      if(countries[i].properties.id == countryData[j].id) {
        for(var k in countryData[i]) {
          if(k != 'name' && k != 'id') {
            if(attributeArray.indexOf(k) == -1) { 
               attributeArray.push(k);
            }
            countries[i].properties[k] = Number(countryData[j][k]);
          } 
        }
        break;
      }
    }
  }
  drawMap(world);
}

/** 
 * Adds all country paths to the map, and generates filters for coloring them.
 * @param {object} world - object imported from json
 */

function drawMap(world) {
  var rankRange = [],
      accessRange = [];

  svg.selectAll(".country")
    .data(topojson.feature(world, world.objects.countries).features)
    .enter().append("path")
    .attr("class", "country")
    .attr("id", function(d) { return "code_" + d.properties.id; }, true)
    .attr("filter", function(d){
      return "url(#filter-" + d.properties.id + ")"; 
    })
    .attr("d", path)
    .on("click", function(d){ countryInfo(d); });

  rankRange = getDataRange('visa-rank');
  accessRange = getDataRange('visa-access');

  // Create a filter for each country. This isn't ideal (because we end up with ~200 filters), but I 
  // can't find another way to implement a multiply effect that uses interpolated values.
  // Each filter generates a color for access and a color for rank using feFlood, and flood-opacity as
  // the interpolated variable. The resulting colors are blended with a multiply effect (feBlend), then
  // clipped to the bounds of the country path with feComposite. 

  d3.selectAll('.country')
    .each(function(d) {
      var opacityAccess = getColor(d.properties['visa-access'], accessRange, 'visa-access'),
          opacityRank = getColor(d.properties['visa-rank'], rankRange, 'visa-rank'),
          filter = svg.select("defs").append("filter").attr("id", "filter-" + d.properties.id);

      filter.attr("x", "0")
          .attr("y", "0");

      filter.append("feFlood")
          .attr("flood-color", "steelblue")
          .attr("flood-opacity", opacityRank)
          .attr("result", "floodBlue")
          .classed("floodBlue", true);

      filter.append("feFlood")
          .attr("flood-color", "indianred")
          .attr("flood-opacity", opacityAccess)
          .classed("floodRed", true);

      // Blends the two floods above with a multiply effect
      filter.append("feBlend")
          .attr("mode", "multiply")
          .attr("in2", "floodBlue")
          .attr("result", "multiply");

      // Keeps the shaded area within the bounds of the path
      filter.append("feComposite")
          .attr("in", "multiply")
          .attr("in2", "SourceGraphic")
          .attr("operator", "atop");
    });
}

/** 
 * Generates opacity value for fill color based on value and scale
 * @param valueIn - value we want the color for
 * @param valuesIn - min / max values for scale
 * @param attribute - name of attribute
 */

function getColor(valueIn, valuesIn, attribute) {
  var reverse = ['pol-rights', 'civil-libs'],
      range = reverse.indexOf(attribute) > -1 ? [1, 0.2] : [0.2, 1];

  if(typeof valueIn === 'undefined'){
    return 0.05;
  }

  var color = d3.scale.linear()
    .domain([valuesIn[0],valuesIn[1]])
    .range(range);

  return color(valueIn);
}

/** 
 * Determines min / max values for any country stat
 * @param {string} attribute - the stat name e.g. visa-rank
 */

function getDataRange(attribute) {
  // function loops through all the data values from the current data attribute
  // and returns the min and max values

  var min = Infinity, max = -Infinity;  

  d3.selectAll('.country')
    .each(function(d,i) {
      var currentValue;

      if(typeof attribute !== 'undefined'){
        currentValue = d.properties[attribute];
      }else{
        d.properties[attributeArray[currentAttribute]];
      }

      if(currentValue <= min && currentValue !== '' && currentValue != 'undefined') {
        min = currentValue;
      }
      if(currentValue >= max && currentValue !== '' && currentValue != 'undefined') {
        max = currentValue;
      }
  });
  return [min,max];
}

/** 
 * Populate and display country info 
 * @param {object} d - data for the country
 */

function countryInfo(d) {
  var properties = ['visa-access', 'visa-rank'];

  d3.select('.country-name').text(d.properties.admin);
  for(var p in properties){
    var prop = properties[p],
        value = d.properties[prop];

    if(typeof value == 'undefined'){
      value = 'N/A';
    }
    d3.select('#country-info .' + prop + ' .number').text(value);
  }
  d3.select('#country-info').style('display', 'block').style('opacity', '1');
}

/** 
 * Hides the country info box
 */

function hideCountryInfo() {
  d3.select('#country-info').style('display', 'none').style('opacity', '0');
}

/** 
 * Sets up map interactions, including ability to show / hide a dataset, use zoom buttons
 */

function mapInteraction() {
  var rankRange = [28, 173],
      accessRange = [0, 194];

  d3.select(".zoom-in")  
    .on("click", zoomInMap);

  d3.select(".zoom-out")  
    .on("click", zoomOutMap);

  d3.select(".reset")  
    .on("click", resetMap);

  d3.select("#country-info").on("click", function(){
    hideCountryInfo();
  });

  d3.selectAll('.attr-select')  
    .on('click', function(d, i) {
      var selected = this.className.indexOf("selected") > -1;

      if(selected){
        if(this.dataset.attribute === "visa-rank"){
          d3.selectAll('.floodBlue')
            .attr("flood-opacity", "0");
        }else if(this.dataset.attribute === "visa-access"){
          d3.selectAll('.floodRed')
            .attr("flood-opacity", "0");
        }

        this.className = this.className.replace("selected", "");
      }else{
        if(this.dataset.attribute === "visa-rank"){
          var attribute = this.dataset.attribute,
              floodClass = 'floodBlue',
              range = rankRange;
        }else if(this.dataset.attribute === "visa-access"){
          var attribute = this.dataset.attribute,
              floodClass = 'floodRed',
              range = accessRange;
        }

        d3.selectAll('.country')
          .each(function(d,i){
            d3.selectAll('#filter-' + d.properties.id + ' .' + floodClass)
              .attr("flood-opacity", function(){
                return getColor(d.properties[attribute], range, attribute);
              });
          });

        this.className += " selected";
      }

  });
}


window.onload = init();