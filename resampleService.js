var dateFns = require('date-fns');

/* 
 * This service resamples a JSON timeseries of the form
 * [['2017-05-05', 22.5], ['2017-10-10', 44.5], ...] when 
 * provided via a POST request's body.
 */

var ResampleService = function(){
  var service = this;
  
  //////////////////////
  // PRIVATE CONSTANTS
  /////////////////////

  /* 
   * For each of the 2 below constants,
   * the key is an option that can get passed
   * as a query string param, the value is a function
   * used to achieve the effect. In many codebases or
   * critical paths, I wouldn't do this, but this is just a toy
   * app and was fun!
   */
  var FREQUENCY_OPTION_METHOD_INDEX = {
    monthEnd: dateFns.lastDayOfMonth,
    weekEnd: dateFns.lastDayOfWeek,
    quarterEnd: dateFns.lastDayOfQuarter,
    yearEnd: dateFns.lastDayOfYear
  };

  var FUNCTION_OPTION_METHOD_INDEX = {
    min: function(values){ return values.reduce(function (a, b) {
      return Math.min(a, b);});
    },
    max: function(values){ return values.reduce(function (a, b) {
      return Math.max(a, b);});
    },
    sum: function(values){ return values.reduce(function (a, b) {
      return a + b;}, 0);
    }
  };
  
  ///////////////////////////
  // PRIVATE SERVICE METHODS
  ///////////////////////////

  // Validates resmpling params from query string
  var validateParams = function(params){
    var resampleFrequency = params.resampleFrequency;
    var resampleFunction = params.resampleFunction;
    
    if (typeof resampleFrequency === 'undefined' || 
        !FREQUENCY_OPTION_METHOD_INDEX.hasOwnProperty(resampleFrequency)){
      throw new Error('Invalid resampleFrequency paramter');
    }

    if (typeof resampleFunction === 'undefined' || 
        !FUNCTION_OPTION_METHOD_INDEX.hasOwnProperty(resampleFunction)){
      throw new Error('Invalid resampleFunction paramter');
    }
  };

  /* 
   * This goes through the provided timeseries
   * converts the date strings to date objects
   * and confirms the values are actually numbers.
   * It just gets it ready for processing!
   */
  var cleanTimeSeries = function(timeseries){
    var cleanedSeries = [];
    for (var i = 0; i < timeseries.length; i++) { 
      
      // get each timeseries entry
      var dateRaw = timeseries[i][0];
      var value = timeseries[i][1];
      
      // cleanup date
      var date = dateFns.parse(dateRaw);
      if (date.toString() === 'Invalid Date'){
        throw new Error('Invalid date: ' + dateRaw);
      }
      
      // cleanup value
      if (isNaN(value)){
        throw new Error('Invalid value: ' + value);
      }
      cleanedSeries.push([date, value]);
    }
    return cleanedSeries;
  };

  /* 
   * This first pass through the timeseries
   * resamples each date to the given frequency
   */
  var applyFrequency = function(resampleFrequency, timeseries){
    var updatedTimeSeries = [];

    for (var i = 0; i < timeseries.length; i++) { 
      var date = timeseries[i][0];
      var value = timeseries[i][1];
      //get the method that converts the date
      var changeFrequencyMethod = FREQUENCY_OPTION_METHOD_INDEX[resampleFrequency];
      var newDate = changeFrequencyMethod(date);
      // formats the date object back to string
      var formattedDate = dateFns.format(newDate, 'YYYY-MM-DD');
      updatedTimeSeries.push([formattedDate, value]);
    }
    return updatedTimeSeries;
  };

  /*
   * This second pass through the timeseries finds
   * values that belong to the same date period and
   * applies the resample function to them.
   */
  var applyFunction = function(resampleFunction, timeseries){
    var updatedTimeSeries = [];
    var frequencyGroups = {};

    for (var i = 0; i < timeseries.length; i++) { 
      var date = timeseries[i][0];
      var value = timeseries[i][1];
      
      // groups values together keyed by
      // a shared date
      if (date in frequencyGroups){
        frequencyGroups[date].push(value);
      } else {
        frequencyGroups[date] = [value];
      }
    }

    // goes through the groups and adds to the
    // new timeseries the new values
    for (var dateKey in frequencyGroups){
      var valueGroup = frequencyGroups[dateKey];
      // get the method that aggregates the values
      var resampleFunctionMethod = FUNCTION_OPTION_METHOD_INDEX[resampleFunction];
      var resampledValue = resampleFunctionMethod(valueGroup);
      updatedTimeSeries.push([dateKey, resampledValue]);
    }

    return updatedTimeSeries;
  };

  /////////////////////////
  // PUBLIC SERVICE METHOD
  /////////////////////////

  /*
   * Interface to service & only exposed method
   * It takes a few passes through the timeseries
   * to change it incrementally so it's not the most
   * efficient, but easy to read!
   */
  service.resample = function(timeseries, resampleParams){
    // Validate
    validateParams(resampleParams);
    var cleanedSeries = cleanTimeSeries(timeseries);
    // Resample
    var newFrequencyTimeSeries = applyFrequency(resampleParams.resampleFrequency, 
      cleanedSeries);
    var resampledTimeseries = applyFunction(resampleParams.resampleFunction, 
      newFrequencyTimeSeries);
    // Return
    return resampledTimeseries;
  };

  return service;
}();

/////////////////
// POST ENDPOINT
/////////////////
module.exports = function (ctx, cb) { 
  var error = null;

  if (typeof ctx.body === 'undefined'){
    error = 'A timeseries must be provided via POST body';
  } else {
    // Attempt Resample!
    try{
      var resampledSeries = ResampleService.resample(ctx.body, ctx.query);
    } catch(err){
      error = err.message;
    }
  }
  /*
   * error defaults to 400.. that's ok for what we're throwing
   * wrapping resampled series in a "details" key, just to add a
   * bit of programmable symmetry with the error rsp; though I
   * don't love the key name.
   */
  cb(error, {details: resampledSeries});   
}
