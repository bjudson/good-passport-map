// Heavily based on:
// http://bl.ocks.org/rgdonohue/9280446

var width, height, projection, path, graticule, svg, attributeArray = [], currentAttribute = 0, playing = false;

function init() {
    setMap();
    animateMap();
    svgPanZoom('#map svg', {
      fit: false,
      center: true,
      minZoom: 1,
      maxZoom: 3,
      controlIconsEnabled: true
    }).panBy({y: 530});
}

function setMap() {

  var width = 1000, 
      height = 650;

  projection = d3.geo.mercator()
    .scale((width + 1) / 2 / Math.PI)
    .translate([width / 2, height / 2])
    .precision(0.1);

  path = d3.geo.path()
      .projection(projection);

  graticule = d3.geo.graticule();

  svg = d3.select("#map").append("svg")
      .attr("width", width)
      .attr("height", height)
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

function loadData() {
  queue()
    .defer(d3.json, "data/world-topo.json") 
    .defer(d3.csv, "data/country-data.csv")
    .await(processData);
}

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

function drawMap(world) {

    svg.selectAll(".country")
      .data(topojson.feature(world, world.objects.countries).features)
      .enter().append("path")
      .attr("class", "country")
      .attr("id", function(d) { return "code_" + d.properties.id; }, true)
      .attr("d", path)
      .on("click", function(d){ countryInfo(d); });

    var dataRange = getDataRange();
    d3.selectAll('.country')
    .attr('fill-opacity', function(d) {
        return getColor(d.properties[attributeArray[currentAttribute]], dataRange);
    });
}

function sequenceMap() {
    var dataRange = getDataRange();
    d3.selectAll('.country').transition() 
      .duration(750) 
      .attr('fill-opacity', function(d) {
        return getColor(d.properties[attributeArray[currentAttribute]], dataRange, attributeArray[currentAttribute]);
      });
}

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

function getDataRange() {
  // function loops through all the data values from the current data attribute
  // and returns the min and max values

  var min = Infinity, max = -Infinity;  
  d3.selectAll('.country')
    .each(function(d,i) {
      var currentValue = d.properties[attributeArray[currentAttribute]],
          upper = {'gdp-cap': 80000};
      if(currentValue <= min && currentValue !== '' && currentValue != 'undefined') {
        min = currentValue;
      }
      if(currentValue >= max && currentValue !== '' && currentValue != 'undefined') {
        if(currentValue >= upper[attributeArray[currentAttribute]]){
          max = upper[attributeArray[currentAttribute]];
        }else{
          max = currentValue;
        }
      }
  });
  return [min,max];
}

function countryInfo(d) {
  var properties = ['civil-libs', 'visa-access', 'visa-rank', 'gdp-cap'];

  d3.select('.country-name').text(d.properties.admin);
  for(var p in properties){
    var prop = properties[p];
    d3.select('#country-info li.' + prop + ' span').text(d.properties[prop]);
  }
  d3.select('#country-info').style('opacity', '.9');
}

function animateMap() {
  d3.selectAll('.attr-select')  
    .on('click', function(d, i) {
      d3.selectAll('.attr-select').classed('selected', false);
      this.className += ' selected';
      currentAttribute = attributeArray.indexOf(this.dataset.attribute);
      sequenceMap();
  });
}


window.onload = init();