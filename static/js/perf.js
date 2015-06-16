var numericFilter = function(x){
  return !isNaN(parseInt(x))
}

function average (arr){
  if(!arr || arr.length == 0) return // undefined for 0-length array
  return _.reduce(arr, function(memo, num){
    return memo + num;
  }, 0) / arr.length;
}


function PerfController($scope, $window, $http){
  $scope.conf = $window.plugins["perf"]
  $scope.task = $window.task_data
  $scope.currentSample
  $scope.perftab = 1
  $scope.project = $window.project
  $scope.getThreadKeys = function(r){
    var keys = _.uniq(_.filter(_.flatten(_.map(r, function(x){ return _.keys(x.results) }), true), numericFilter))
    return keys
  }
 $scope.compareHash = ""
 $scope.comparePerfSample = null

 $scope.clearCompare = function(){
   $scope.compareHash = ""
   $scope.comparePerfSample = null
 }

 // convert a percentage to a color. Higher -> greener, Lower -> redder.
 $scope.percentToColor = function(percent) {
   var percentColorRanges = [
     {min:-Infinity, max:-15, color: "#FF0000"},
     {min:-15, max:-10,       color: "#FF5500"},
     {min:-10, max:-5,        color: "#FFAA00"},
     {min:-5, max:-2.5,       color: "#FEFF00"},
     {min:-2.5, max:5,        color: "#A9FF00"},
     {min:5, max:10,          color: "#54FF00"},
     {min:10, max:+Infinity,  color: "#00FF00"}
   ]

    for(var i=0;i<percentColorRanges.length;i++){
      if(percent>percentColorRanges[i].min && percent<=percentColorRanges[i].max){
        return percentColorRanges[i].color
      }
    }
    return ""
  }

  $scope.percentDiff = function(val1, val2){
    return (val1 - val2)/val1
  }

  $scope.getPctDiff = function(referenceOps, sample, testKey){
    if(sample == null) return "";
    var compareTest = _.find(sample.data.results, function(x){return x.name == testKey})
    var compareMaxOps = $scope.getMax(compareTest.results)
    var pctDiff = (referenceOps-compareMaxOps)/referenceOps
    return pctDiff
  }

  $scope.getMax = function(r){
    return _.max(_.filter(_.pluck(_.values(r), 'ops_per_sec'), numericFilter))
  }

  var drawDetailGraph = function(sample1, sample2){
    var testNames = sample1.testNames()
    for(var i=0;i<testNames.length;i++){
      var testName = testNames[i]
      $("#chart-" + $scope.task.id + "-" + i).empty()

      var testname = testNames[i]
      var series = [{ color: 'lightblue', data: sample1.threadsVsOps(testName)}]
      if(!!sample2){
        series.push({ color: 'lightpink', data: sample2.threadsVsOps(testName)})
      }

      var target = "#chart-" + $scope.task.id + "-" + i
      var graph = new Rickshaw.Graph( {
        element: document.querySelector(target), 
          width: 150, 
          height: 80, 
          renderer:"bar",
          stack:false,
          series: series,
          padding: {top: 0.2, left: 0.1, right: 0.1, bottom: 0.1},

      })

      var yAxis = new Rickshaw.Graph.Axis.Y({ graph: graph, ticks:2 });
      var x_axis = new Rickshaw.Graph.Axis.X({ 
        graph: graph, 
        orientation:"top",
        tickValues:_.map(sample1.threads(), function(k){return parseInt(k)-.5}), 
         tickFormat:function(t){return Math.floor(t)+1}
      })
      graph.render();
    }
  }

  $scope.getSampleAtCommit = function(series, commit) {
    return _.find(series, function(x){return x.revision == commit})
  }

  $scope.getCommits = function(seriesByName){
    // get a unique list of all the revisions in the test series, accounting for gaps where some tests might have no data,
    // in order of push time.
    return _.uniq(_.pluck(_.sortBy(_.flatten(_.values(seriesByName)), "order"), "revision"), true)
  }

  $scope.updateComparison = function(x){
    $scope.compareHash = x
    $http.get("/plugin/json/commit/" + $scope.project + "/" + $scope.compareHash + "/" + $scope.task.build_variant + "/" + $scope.task.display_name + "/perf").success(function(d){
      $scope.comparePerfSample = new TestSample(d)
      drawDetailGraph($scope.perfSample, $scope.comparePerfSample)
      drawTrendGraph($scope.trendSamples, $scope, $scope.task.id, $scope.comparePerfSample)
    }).error(function(){
      $scope.comparePerfSample = null
    })
  }

  if($scope.conf.enabled){
    // Populate the graph and table for this task
    $http.get("/plugin/json/task/" + $scope.task.id + "/perf/")
      .success(function(d){
        $scope.perfSample = new TestSample(d)
        var w = 700
        var bw = 1
        var h = 100
        setTimeout(function(){drawDetailGraph($scope.perfSample)},0)
      })

    function generateSummary(sample){
      var tout = $('<table></table>')
      for(k in sample){
        var row = $('<tr>')
        row.append($('<th></th>').text(k))
        row.append($('<td></td>').text(sample[k]))
        tout.append(row)
      }
      return tout
    }  

    // Populate the trend data
    $http.get("/plugin/json/history/" + $scope.task.id + "/perf")
      .success(function(d){
        $scope.trendSamples = new TrendSamples(d)
        setTimeout(function(){drawTrendGraph($scope.trendSamples, $scope, $scope.task.id, null)},0)
      })

    if($scope.task.patch_info && $scope.task.patch_info.Patch.Githash){
      //pre-populate comparison vs. base commit of patch.
      $scope.updateComparison($scope.task.patch_info.Patch.Githash)
    }
  }
}

function TrendSamples(samples){
  this.samples = samples
  this._sampleByCommitIndexes = {}
  this.seriesByName = {}
  this.testNames = []
  for (var i = 0; i < samples.length; i++) {
    for (var j = 0; j < samples[i].data.results.length; j++) {
      var name = samples[i].data.results[j].name
      if (!(name in this.seriesByName)) {
        this.seriesByName[name] = []
      }
      var rec = samples[i].data.results[j]
      var sorted = _.sortBy(_.filter(_.values(rec.results), function(x){return typeof(x)=="object"}), "ops_per_sec")
      var maxops = sorted[0].ops_per_sec
      var maxops_values = 
      this.seriesByName[name].push({
        revision: samples[i].revision,
        task_id: samples[i].task_id,
        "ops_per_sec": sorted[0].ops_per_sec,
        "ops_per_sec_values": sorted[0].ops_per_sec_values,
        order: samples[i].order,
      })
    }
  }

  for(key in this.seriesByName){
    this.seriesByName[key] = _.sortBy(this.seriesByName[key], 'order')
    this.testNames.unshift(key)
  }

  for(var i=0;i<this.testNames.length;i++){
    //make an index for commit hash -> sample for each test series
    var k = this.testNames[i]
    this._sampleByCommitIndexes[k] = _.groupBy(this.seriesByName[k], "revision"), function(x){return x[0]}
    for(t in this._sampleByCommitIndexes[k]){
      this._sampleByCommitIndexes[k][t] = this._sampleByCommitIndexes[k][t][0]
    }
  }

  this.commits = function(testName){
    if(!this._commits){
      this._commits = _.uniq(_.pluck(_.sortBy(_.flatten(_.values(this.seriesByName)), "order"), "revision"), false)
    }
    return this._commits
  }

  this.sampleInSeriesAtCommit = function(testName, revision){
    return this._sampleByCommitIndexes[testName][revision]
  }

  this.noiseAtCommit = function(testName, revision){
    var sample = this._sampleByCommitIndexes[testName][revision]
    if(sample && sample.ops_per_sec_values && sample.ops_per_sec_values.length > 1){
      console.log("max:", _.max(sample.ops_per_sec_values))
      console.log("min:", _.min(sample.ops_per_sec_values))
      console.log("avg:", average(sample.ops_per_sec_values))
      var r = (_.max(sample.ops_per_sec_values) - _.min(sample.ops_per_sec_values)) / average(sample.ops_per_sec_values)
      console.log("r", r)
      return r
    }
  }

}

function TestSample(sample){
  this.sample = sample
  this._threads = null
  this._maxes = {}

  this.threads = function(){
    if(this._threads == null){
      this._threads = _.uniq(_.filter(_.flatten(_.map(this.sample.data.results, function(x){ return _.keys(x.results) }), true), numericFilter))
    }
    return this._threads
  }

  this.testNames = function(){
    return _.pluck(this.sample.data.results, "name") 
  }

  this.threadsVsOps = function(testName){
    var testInfo = this.resultForTest(testName)
    var result = []
    if(!testInfo)
      return
    var series = testInfo.results
    var keys = _.filter(_.keys(series), numericFilter)
    for(var j=0;j<keys.length;j++){
      result.push({x:j, y:series[keys[j]].ops_per_sec})
    }
    return result
  }

  this.resultForTest = function(testName){
      return _.find(this.sample.data.results, function(x){return x.name == testName})
  }

  this.maxThroughputForTest = function(testName){
    if(!_.has(this._maxes, testName)){
      var d = this.resultForTest(testName)
      if(!d){
        return
      }
      this._maxes[testName] = _.max(_.filter(_.pluck(_.values(d.results), 'ops_per_sec'), numericFilter))
    }
    return this._maxes[testName]
  }

}

var drawTrendGraph = function(trendSamples, scope, taskId, compareSample) {
  for (var i = 0; i < trendSamples.testNames.length; i++) {
    $("#perf-trendchart-" + taskId + "-" + i).empty()
    var margin = {
      top: 20,
      right: 50,
      bottom: 30,
      left: 50
    }
    var width = 960 - margin.left - margin.right
    var height = 200 - margin.top - margin.bottom;

    var key = trendSamples.testNames[i]
    var svg = d3.select("#perf-trendchart-" + taskId + "-" + i)
      .append("svg")
      .attr('class', "series")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom);
    var series = trendSamples.seriesByName[key]
    var ops = _.pluck(series, 'ops_per_sec')
    var y = d3.scale.linear()
      .domain([d3.min(ops), d3.max(ops)])
      .range([height, 0]);
    var x = d3.scale.linear()
      .domain([0, ops.length - 1])
      .range([0, width]);

    var line = d3.svg.line()
      .x(function(d, i) {
        return x(i);
      })
      .y(function(d) {
        return y(d.ops_per_sec)
      })

    svg.append("path")
      .data([series])
      .attr("class", "line")
      .attr("d", line)

    var focus = svg.append("circle")
      .attr("r", 4.5);

    svg.selectAll(".point")
      .data(series)
      .enter()
      .append("svg:circle")
      .attr("class", "point")
      .attr("cx", function(d, i) {
        return x(i)
      })
      .attr("cy", function(d) {
        return y(d.ops_per_sec)
      })
      .attr("r", 2)
    var bsctr = d3.bisector(function(d) {
      return y(d.ops_per_sec)
    }).right
    svg.append("rect")
      .attr("class", "overlay")
      .attr("y", margin.top)
      .attr("width", width)
      .attr("height", height)
      .on("mouseover", function() {
        focus.style("display", null);
      })
      .on("mouseout", function() {
        focus.style("display", "none");
      })
      .on("mousemove", function(data, f, yscale, scope, series) {
        return function() {
          var x0 = x.invert(d3.mouse(this)[0])
          var i = parseInt(x0)
          f.attr("cx", x(i)).attr("cy", yscale(data[i].ops_per_sec))
          scope.currentSample = data[i]
          scope.currentHoverSeries = series
          scope.$apply()
        }
      }(series, focus, y, scope, key));

    var avgOpsPerSec = d3.mean(ops)
    if (compareSample) {
      compareMax = compareSample.maxThroughputForTest(key)
      if (!isNaN(compareMax)) {
        var compareLine = d3.svg.line()
          .x(function(d, i) {
            return x(i)
          })
          .y(function(d) {
            return y(compareMax)
          })

        svg.append("line")
          .attr("stroke", "#6666FF")
          .attr("stroke-width", "1")
          .attr("stroke-dasharray", "5,5")
          .attr("class", "mean-line")
          .attr({
            x1: x(0),
            x2: x(width),
            y1: y(compareMax),
            y2: y(compareMax)
          })
      }
    }

    var padding = 30
    var yAxis = d3.svg.axis()
      .scale(y)
      .orient("left")
      .ticks(5);
    svg.append("g")
      .attr("class", "axis")
      .call(yAxis);
  }
}
